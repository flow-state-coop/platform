import { sql } from "kysely";
import { isAddress } from "viem";
import { db } from "../../db";
import {
  generateNotificationToken,
  verifyNotificationToken,
} from "@/lib/notificationToken";

export type UnsubscribeResult =
  | { ok: true; token: string }
  | { ok: false; status: number; error: string };

/**
 * Verifies the notification token, turns off every category, and bumps
 * `email_version`.
 *
 * Bumping the version invalidates the link that was just used: an
 * unsubscribe link that gets forwarded or left in shared browser history
 * can no longer be replayed to silently re-enable notifications after the
 * user opted out. Re-enabling now requires a fresh email link (which only
 * the inbox owner receives) or the in-session token returned here.
 *
 * Concurrency note: the verify reads the pre-bump version while the UPDATE
 * uses an atomic `email_version + 1`, so two concurrent calls with the same
 * link both succeed and the version advances by two. This matches the
 * documented behaviour of the profile PUT handler and is acceptable at
 * current scale.
 */
export async function performUnsubscribe(
  rawAddress: string,
  token: string,
): Promise<UnsubscribeResult> {
  if (!isAddress(rawAddress)) {
    return { ok: false, status: 400, error: "Invalid address" };
  }

  const address = rawAddress.toLowerCase();

  const profile = await db
    .selectFrom("userProfiles")
    .select(["emailVersion"])
    .where("address", "=", address)
    .executeTakeFirst();

  if (!profile) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (!verifyNotificationToken(address, profile.emailVersion, token)) {
    return { ok: false, status: 403, error: "Invalid token" };
  }

  const updated = await db
    .updateTable("userProfiles")
    .set({
      notifyApplicationEligibility: false,
      notifyProjectChannels: false,
      notifyRoundAnnouncements: false,
      notifyInternalReview: false,
      notifyPlatform: false,
      // Raw SQL so the increment is atomic at the DB level. The cast is
      // required because Updateable narrows to the column type; Kysely
      // accepts the raw expression at runtime.
      emailVersion: sql<number>`email_version + 1` as unknown as number,
      updatedAt: new Date(),
    })
    .where("address", "=", address)
    .returning(["emailVersion"])
    .executeTakeFirstOrThrow();

  return {
    ok: true,
    token: generateNotificationToken(address, updated.emailVersion),
  };
}
