/**
 * Pre-launch audit for Email Notifications v2.
 *
 * Prints counts of users who will be affected by the migration:
 *  1. project_emails rows with no manager_address — these emails cannot be
 *     migrated, so these recipients will silently stop receiving notifications.
 *  2. round_admin_emails for admin wallets that have no user_profiles row —
 *     same outcome.
 *  3. user_profiles with email set but consent_confirmed_at null — these
 *     users will see the first-login consent modal.
 *
 * Run: pnpm tsx scripts/pre-launch-audit.ts
 */
import { db } from "../src/app/api/flow-council/db";

async function main() {
  const orphanProjectEmails = await db
    .selectFrom("projectEmails")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("managerAddress", "is", null)
    .executeTakeFirstOrThrow();

  const adminEmailsWithoutProfile = await db
    .selectFrom("roundAdminEmails as rae")
    .innerJoin("roundAdmins as ra", "ra.id", "rae.roundAdminId")
    .leftJoin("userProfiles as up", "up.address", "ra.adminAddress")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("up.address", "is", null)
    .executeTakeFirstOrThrow();

  const usersAwaitingConsent = await db
    .selectFrom("userProfiles")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("email", "is not", null)
    .where("consentConfirmedAt", "is", null)
    .executeTakeFirstOrThrow();

  console.log("=== Email Notifications v2 — pre-launch audit ===");
  console.log(
    `Orphan project_emails (manager_address NULL): ${orphanProjectEmails.count}`,
  );
  console.log(
    `round_admin_emails whose admin wallet has no profile: ${adminEmailsWithoutProfile.count}`,
  );
  console.log(
    `Users with email but no consent (will see first-login modal): ${usersAwaitingConsent.count}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
