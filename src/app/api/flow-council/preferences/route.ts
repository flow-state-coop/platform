import { z } from "zod";
import { sql } from "kysely";
import { isAddress } from "viem";
import { db } from "../db";
import {
  generateNotificationToken,
  verifyNotificationToken,
} from "@/lib/notificationToken";
import { readJsonBody, PayloadTooLargeError } from "../../utils";

export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 4_000;

const NOTIFY_FIELDS = [
  "notifyApplicationEligibility",
  "notifyProjectChannels",
  "notifyRoundAnnouncements",
  "notifyInternalReview",
  "notifyPlatform",
] as const;

type NotifyField = (typeof NOTIFY_FIELDS)[number];

const preferencesUpdateSchema = z.object({
  notifyApplicationEligibility: z.boolean().optional(),
  notifyProjectChannels: z.boolean().optional(),
  notifyRoundAnnouncements: z.boolean().optional(),
  notifyInternalReview: z.boolean().optional(),
  notifyPlatform: z.boolean().optional(),
});

const postBodySchema = z.object({
  token: z.string().min(1),
  address: z.string().min(1),
  preferences: preferencesUpdateSchema,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildPreferencesPayload(row: {
  notifyApplicationEligibility: boolean;
  notifyProjectChannels: boolean;
  notifyRoundAnnouncements: boolean;
  notifyInternalReview: boolean;
  notifyPlatform: boolean;
  emailSuspendedAt: Date | null;
  emailSuspensionReason: string | null;
  email?: string | null;
  displayName?: string | null;
}) {
  return {
    success: true,
    preferences: {
      notifyApplicationEligibility: row.notifyApplicationEligibility,
      notifyProjectChannels: row.notifyProjectChannels,
      notifyRoundAnnouncements: row.notifyRoundAnnouncements,
      notifyInternalReview: row.notifyInternalReview,
      notifyPlatform: row.notifyPlatform,
    },
    emailSuspendedAt: row.emailSuspendedAt,
    emailSuspensionReason: row.emailSuspensionReason,
    email: row.email ?? null,
    displayName: row.displayName ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawAddress = searchParams.get("address");
    const token = searchParams.get("token");

    if (!rawAddress || !isAddress(rawAddress)) {
      return jsonResponse({ success: false, error: "Invalid address" }, 400);
    }
    if (!token) {
      return jsonResponse({ success: false, error: "Missing token" }, 400);
    }

    const address = rawAddress.toLowerCase();

    const profile = await db
      .selectFrom("userProfiles")
      .select([
        "emailVersion",
        "notifyApplicationEligibility",
        "notifyProjectChannels",
        "notifyRoundAnnouncements",
        "notifyInternalReview",
        "notifyPlatform",
        "emailSuspendedAt",
        "emailSuspensionReason",
        "email",
        "displayName",
      ])
      .where("address", "=", address)
      .executeTakeFirst();

    if (!profile) {
      return jsonResponse({ success: false, error: "Not found" }, 404);
    }

    if (!verifyNotificationToken(address, profile.emailVersion, token)) {
      return jsonResponse({ success: false, error: "Invalid token" }, 403);
    }

    return jsonResponse(buildPreferencesPayload(profile));
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await readJsonBody(request, MAX_BODY_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return jsonResponse(
          { success: false, error: "Payload too large" },
          413,
        );
      }
      return jsonResponse(
        { success: false, error: "Invalid request body" },
        400,
      );
    }

    const parsed = postBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse(
        { success: false, error: "Invalid request body" },
        400,
      );
    }

    const { token, address: rawAddress, preferences } = parsed.data;
    if (!isAddress(rawAddress)) {
      return jsonResponse({ success: false, error: "Invalid address" }, 400);
    }

    const address = rawAddress.toLowerCase();

    const profile = await db
      .selectFrom("userProfiles")
      .select(["emailVersion"])
      .where("address", "=", address)
      .executeTakeFirst();

    if (!profile) {
      return jsonResponse({ success: false, error: "Not found" }, 404);
    }

    if (!verifyNotificationToken(address, profile.emailVersion, token)) {
      return jsonResponse({ success: false, error: "Invalid token" }, 403);
    }

    const updates: Partial<Record<NotifyField, boolean>> = {};
    for (const field of NOTIFY_FIELDS) {
      const value = preferences[field];
      if (typeof value === "boolean") {
        updates[field] = value;
      }
    }

    const RETURN_COLUMNS = [
      "notifyApplicationEligibility",
      "notifyProjectChannels",
      "notifyRoundAnnouncements",
      "notifyInternalReview",
      "notifyPlatform",
      "emailSuspendedAt",
      "emailSuspensionReason",
      "emailVersion",
    ] as const;

    let updated;
    if (Object.keys(updates).length > 0) {
      // Bump email_version on every mutation so a forwarded or
      // shared-history preference link can't be replayed after the user
      // has changed their mind. The page that issued this request keeps
      // working because it adopts the rotated token returned below.
      updated = await db
        .updateTable("userProfiles")
        .set({
          ...updates,
          emailVersion: sql<number>`email_version + 1` as unknown as number,
          updatedAt: new Date(),
        })
        .where("address", "=", address)
        .returning([...RETURN_COLUMNS])
        .executeTakeFirstOrThrow();
    } else {
      updated = await db
        .selectFrom("userProfiles")
        .select([...RETURN_COLUMNS])
        .where("address", "=", address)
        .executeTakeFirstOrThrow();
    }

    return jsonResponse({
      ...buildPreferencesPayload(updated),
      token: generateNotificationToken(address, updated.emailVersion),
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
