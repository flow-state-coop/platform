/**
 * Backfill user_profiles.email from project_emails for wallets that have a
 * profile but no email recorded. Does NOT set consent — pre-populated emails
 * are inert until the user completes the first-login modal.
 *
 * Run: pnpm tsx scripts/migrate-project-emails.ts
 */
import { db } from "../src/app/api/flow-council/db";

async function main() {
  const rows = await db
    .selectFrom("projectEmails")
    .select(["managerAddress", "email"])
    .where("managerAddress", "is not", null)
    .where("email", "is not", null)
    .execute();

  type Entry = { address: string; email: string };
  const byAddress = new Map<string, Entry[]>();
  for (const r of rows) {
    if (!r.managerAddress || !r.email) continue;
    const addr = r.managerAddress.toLowerCase();
    const list = byAddress.get(addr) ?? [];
    list.push({ address: addr, email: r.email });
    byAddress.set(addr, list);
  }

  let updated = 0;
  let skippedConflict = 0;
  let skippedExisting = 0;

  for (const [address, entries] of byAddress) {
    const distinctEmails = new Set(entries.map((e) => e.email));
    if (distinctEmails.size > 1) {
      console.log(
        `CONFLICT: ${address} has multiple distinct emails — skipping. Emails: ${[...distinctEmails].join(", ")}`,
      );
      skippedConflict++;
      continue;
    }

    const email = entries[0].email;
    const profile = await db
      .selectFrom("userProfiles")
      .select(["address", "email"])
      .where("address", "=", address)
      .executeTakeFirst();

    if (!profile) continue;

    if (profile.email && profile.email.length > 0) {
      skippedExisting++;
      continue;
    }

    await db
      .updateTable("userProfiles")
      .set({ email })
      .where("address", "=", address)
      .where((eb) =>
        eb.or([eb("email", "is", null), eb("email", "=", "")]),
      )
      .execute();
    updated++;
  }

  console.log(
    `Done. Updated: ${updated}, conflicts skipped: ${skippedConflict}, existing-email skipped: ${skippedExisting}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
