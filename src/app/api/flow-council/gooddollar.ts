import type { Address, PublicClient } from "viem";
import type { Transaction } from "kysely";
import type { DB } from "@/generated/kysely";
import { db } from "./db";
import { networks } from "@/lib/networks";
import { getCouncilPublicClient } from "./metrics/lib";
import { CELO_CHAIN_ID } from "@/app/flow-councils/lib/constants";
import { resolveVerifiedRoots } from "@/app/flow-councils/lib/goodDollarIdentity";

// Celo is a static entry in `networks`, so the lookup can't miss.
const CELO_NETWORK = networks.find((network) => network.id === CELO_CHAIN_ID)!;

// Rows per INSERT when seeding claims, matching the members endpoint so a
// council with thousands of voters never emits one enormous statement.
const CLAIM_INSERT_BATCH = 500;

export const IDENTITY_CONFLICT_ERROR =
  "Some addresses share a GoodDollar identity with a voter on this council";

export type IdentityClaim = { rootAddress: string; address: string };

/**
 * Read-only Celo client for GoodDollar identity lookups, memoized per chain
 * alongside every other council read client.
 */
export function getCeloIdentityClient() {
  return getCouncilPublicClient(CELO_NETWORK) as PublicClient;
}

/**
 * The GoodDollar identity behind every wallet already voting on a council,
 * first wallet wins per identity.
 *
 * Enabling self-claim on a council whose voters were never identity-checked
 * would otherwise leave their identities unclaimed, so every other wallet their
 * holders connected could take a second spot.
 */
export async function loadClaimsForExistingVoters(
  roundId: number,
): Promise<IdentityClaim[]> {
  const members = await db
    .selectFrom("voterGroupMembers")
    .select(["address"])
    .where("roundId", "=", roundId)
    .orderBy("id", "asc")
    .execute();

  if (members.length === 0) {
    return [];
  }

  const roots = await resolveVerifiedRoots(
    getCeloIdentityClient(),
    members.map((member) => member.address as Address),
  );

  const claims: IdentityClaim[] = [];
  const taken = new Set<string>();

  for (const member of members) {
    const address = member.address.toLowerCase();
    const root = roots.get(address);

    if (!root || taken.has(root)) {
      continue;
    }

    taken.add(root);
    claims.push({ rootAddress: root, address });
  }

  return claims;
}

export async function insertClaims(
  trx: Transaction<DB>,
  roundId: number,
  claims: IdentityClaim[],
): Promise<void> {
  for (let i = 0; i < claims.length; i += CLAIM_INSERT_BATCH) {
    await trx
      .insertInto("gooddollarClaimedRoots")
      .values(
        claims
          .slice(i, i + CLAIM_INSERT_BATCH)
          .map((claim) => ({ roundId, ...claim })),
      )
      .onConflict((oc) => oc.columns(["roundId", "rootAddress"]).doNothing())
      .execute();
  }
}

/**
 * The subset of `roots` whose root address is itself voting on this council.
 *
 * A council that enabled GoodDollar after its voters were added has no claim
 * recorded for them, so the root voting here is the only thing that says the
 * identity's single slot is taken.
 */
export async function loadVotingRoots(
  roundId: number,
  roots: string[],
): Promise<Set<string>> {
  if (roots.length === 0) {
    return new Set();
  }

  const rows = await db
    .selectFrom("voterGroupMembers")
    .select(["address"])
    .where("roundId", "=", roundId)
    .where("address", "in", roots)
    .execute();

  return new Set(rows.map((row) => row.address));
}
