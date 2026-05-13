import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../db";
import { verifyNotificationToken } from "@/lib/notificationToken";
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

    if (Object.keys(updates).length > 0) {
      await db
        .updateTable("userProfiles")
        .set({ ...updates, updatedAt: new Date() })
        .where("address", "=", address)
        .executeTakeFirst();
    }

    const updated = await db
      .selectFrom("userProfiles")
      .select([
        "notifyApplicationEligibility",
        "notifyProjectChannels",
        "notifyRoundAnnouncements",
        "notifyInternalReview",
        "notifyPlatform",
        "emailSuspendedAt",
        "emailSuspensionReason",
      ])
      .where("address", "=", address)
      .executeTakeFirstOrThrow();

    return jsonResponse(buildPreferencesPayload(updated));
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
