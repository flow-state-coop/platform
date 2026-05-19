import { db } from "../src/app/api/flow-council/db";

async function main() {
  const rows = await db
    .selectFrom("projectEmails")
    .select(["managerAddress", "email", "createdAt", "projectId"])
    .where("managerAddress", "is not", null)
    .where("email", "is not", null)
    .execute();

  const byAddr = new Map<
    string,
    { email: string; createdAt: Date; projectId: number }[]
  >();
  for (const r of rows) {
    if (!r.managerAddress || !r.email) continue;
    const a = r.managerAddress.toLowerCase();
    const l = byAddr.get(a) ?? [];
    l.push({ email: r.email, createdAt: r.createdAt, projectId: r.projectId });
    byAddr.set(a, l);
  }

  let alreadyHasEmail = 0;
  let noProfile = 0;
  let genuine = 0;

  for (const [addr, entries] of byAddr) {
    const distinct = new Set(entries.map((e) => e.email));
    if (distinct.size <= 1) continue; // not a conflict

    const profile = await db
      .selectFrom("userProfiles")
      .select(["address", "email", "displayName"])
      .where("address", "=", addr)
      .executeTakeFirst();

    const sorted = [...entries].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const newest = sorted[0];

    let cls: string;
    if (!profile) {
      cls = "NO_PROFILE (cannot backfill regardless)";
      noProfile++;
    } else if (profile.email && profile.email.length > 0) {
      cls = `ALREADY_SET (profile.email=${profile.email}) — no action needed`;
      alreadyHasEmail++;
    } else {
      cls = "GENUINE_GAP — profile exists, no email, needs a pick";
      genuine++;
    }

    console.log(`\n${addr}  [${cls}]`);
    if (profile) console.log(`  profile: "${profile.displayName}"`);
    for (const e of sorted) {
      console.log(
        `   ${e.email}   (project ${e.projectId}, ${e.createdAt.toISOString().slice(0, 10)})${e === newest ? "  <- most recent" : ""}`,
      );
    }
  }

  console.log(
    `\n=== ${alreadyHasEmail} already-set (no action) | ${noProfile} no-profile (can't fix via backfill) | ${genuine} genuine gaps needing a decision ===`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
