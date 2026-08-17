/**
 * Record the GoodDollar identity behind every wallet already voting on a
 * council that had self-claim enabled before claim tracking existed.
 *
 * Run:         pnpm tsx scripts/backfill-gooddollar-claims.ts
 * Dry run:     DRY_RUN=1 pnpm tsx scripts/backfill-gooddollar-claims.ts
 *
 * The table's migration seeds what SQL can see, which is each self-claimed
 * wallet standing as its own root (only a root passed the isWhitelisted check
 * those claims were made against). It cannot see the rest: an admin may have
 * hand-added a wallet its holder connected to an identity anchored elsewhere,
 * and a verified voter may be sitting in a manual group. Both leave the real
 * root unclaimed, so its holder could take a second spot with another wallet.
 * Only Celo can resolve those, which is what this does.
 *
 * Councils that enable GoodDollar from here on are seeded by the voter-groups
 * route as the group is created, so this is a one-time pass over the councils
 * that predate it. Re-running is harmless: a root already claimed keeps its
 * existing wallet.
 */
import { db } from "../src/app/api/flow-council/db";
import {
  getCeloIdentityClient,
  loadClaimsForExistingVoters,
} from "../src/app/api/flow-council/gooddollar";
import { resolveVerifiedRoot } from "../src/app/flow-councils/lib/goodDollarIdentity";
import type { Address } from "viem";

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  if (DRY_RUN) {
    console.log("[DRY RUN] No claims will be written.");
  }

  // One probe before the sweep, so a Celo that is down from the start fails
  // before anything is written. It proves nothing about the rest of the run;
  // Celo can still drop mid-sweep, and then the catch below names the council
  // the run stopped on.
  await resolveVerifiedRoot(
    getCeloIdentityClient(),
    "0x0000000000000000000000000000000000000001" as Address,
  );

  const councils = await db
    .selectFrom("voterGroups")
    .select("roundId")
    .where("eligibilityMethod", "=", "gooddollar")
    .distinct()
    .execute();

  console.log(`GoodDollar councils: ${councils.length}`);

  let written = 0;
  let held = 0;

  for (const { roundId } of councils) {
    let claims;

    try {
      ({ claims } = await loadClaimsForExistingVoters(roundId));
    } catch (err) {
      console.error(
        `Stopped at round ${roundId}. Councils before it are seeded; ` +
          `re-running is safe and resumes from here.`,
      );
      throw err;
    }

    for (const claim of claims) {
      const existing = await db
        .selectFrom("gooddollarClaimedRoots")
        .select(["address"])
        .where("roundId", "=", roundId)
        .where("rootAddress", "=", claim.rootAddress)
        .executeTakeFirst();

      if (existing) {
        if (existing.address !== claim.address) {
          // The identity is spoken for by a different wallet, which is the
          // state this table exists to keep. Two of its wallets voting is a
          // pre-existing double vote for an admin to resolve by hand.
          console.log(
            `round ${roundId}: ${claim.rootAddress} held by ${existing.address}, ` +
              `${claim.address} also votes here`,
          );
        }
        held++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `[DRY] round ${roundId}: would claim ${claim.rootAddress} for ${claim.address}`,
        );
      } else {
        await db
          .insertInto("gooddollarClaimedRoots")
          .values({ roundId, ...claim })
          .onConflict((oc) => oc.columns(["roundId", "rootAddress"]).doNothing())
          .execute();
      }

      written++;
    }
  }

  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Done. ${
      DRY_RUN ? "Would claim" : "Claimed"
    }: ${written}, already recorded: ${held}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
