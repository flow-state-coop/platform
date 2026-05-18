import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../../db";
import { verifyNotificationToken } from "@/lib/notificationToken";
import { readJsonBody, PayloadTooLargeError } from "../../../utils";

export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 4_000;

const bodySchema = z.object({
  token: z.string().min(1),
  address: z.string().min(1),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse(
        { success: false, error: "Invalid request body" },
        400,
      );
    }

    const { token, address: rawAddress } = parsed.data;
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

    await db
      .updateTable("userProfiles")
      .set({
        notifyApplicationEligibility: false,
        notifyProjectChannels: false,
        notifyRoundAnnouncements: false,
        notifyInternalReview: false,
        notifyPlatform: false,
        updatedAt: new Date(),
      })
      .where("address", "=", address)
      .executeTakeFirst();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
