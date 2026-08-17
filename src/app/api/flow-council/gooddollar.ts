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

// Rows per INSERT statement wherever claims or members are written in bulk, so
// a council with thousands of voters never emits one enormous statement.
export const INSERT_BATCH = 500;

export const IDENTITY_CONFLICT_ERROR =
  "Some addresses share a GoodDollar identity with a voter on this council";

// Both identity-checked writes (manual add, group switch) fail closed on it:
// writing without the check is what hands an identity a second voter.
export const CELO_UNREACHABLE_ERROR =
  "Could not reach GoodDollar on Celo to check identities, please try again";

export type IdentityClaim = { rootAddress: string; address: string };

// The claims a council's voters resolve to, alongside the addresses they were
// resolved from. The sweep runs on Celo before the transaction that writes it,
// so the addresses are what says whether the snapshot still describes the
// council when it lands.
export type IdentitySnapshot = {
  claims: IdentityClaim[];
  addresses: Set<string>;
};

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
): Promise<IdentitySnapshot> {
  const members = await db
    .selectFrom("voterGroupMembers")
    .select(["address"])
    .where("roundId", "=", roundId)
    .orderBy("id", "asc")
    .execute();

  const addresses = new Set(
    members.map((member) => member.address.toLowerCase()),
  );

  if (members.length === 0) {
    return { claims: [], addresses };
  }

  const roots = await resolveVerifiedRoots(
    getCeloIdentityClient(),
    members.map((member) => member.address as Address),
  );

  const claims: IdentityClaim[] = [];
  const holders = new Map<string, string>();
  const conflicts: string[] = [];

  for (const member of members) {
    const address = member.address.toLowerCase();
    const root = roots.get(address);

    if (!root) {
      continue;
    }

    const holder = holders.get(root);

    if (holder) {
      conflicts.push(`${address} shares ${root} with ${holder}`);
      continue;
    }

    holders.set(root, address);
    claims.push({ rootAddress: root, address });
  }

  // A council can reach this with two wallets of one identity already voting,
  // which is a double vote no seeding can undo: recording the first wallet is
  // all the table can say, and removing the second is an admin's call. Say so
  // rather than picking silently.
  if (conflicts.length > 0) {
    console.warn(
      `round ${roundId}: ${conflicts.length} voter(s) share a GoodDollar identity with another voter on this council; ${conflicts.join(", ")}`,
    );
  }

  return { claims, addresses };
}

/**
 * The council's voters that `snapshot` never looked up.
 *
 * The identity sweep runs on Celo outside the transaction that seeds it, so a
 * manual add landing in between is a wallet self-claim is about to cover with
 * its identity unrecorded, which is the second spot the claim table exists to
 * refuse. Read inside the transaction that holds the council's lock, where a
 * non-empty answer means the snapshot is stale and the request should be made
 * again rather than committed.
 */
export async function votersMissingFromSnapshot(
  trx: Transaction<DB>,
  roundId: number,
  snapshot: IdentitySnapshot,
): Promise<string[]> {
  const members = await trx
    .selectFrom("voterGroupMembers")
    .select(["address"])
    .where("roundId", "=", roundId)
    .execute();

  return members
    .map((member) => member.address.toLowerCase())
    .filter((address) => !snapshot.addresses.has(address));
}

export async function insertClaims(
  trx: Transaction<DB>,
  roundId: number,
  claims: IdentityClaim[],
): Promise<void> {
  for (let i = 0; i < claims.length; i += INSERT_BATCH) {
    await trx
      .insertInto("gooddollarClaimedRoots")
      .values(
        claims
          .slice(i, i + INSERT_BATCH)
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
