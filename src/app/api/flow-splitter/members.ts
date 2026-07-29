import { gql } from "@apollo/client";
import type { Address } from "viem";
import { getApolloClient } from "@/lib/apollo";
import type { Network } from "@/types/network";
import { db } from "../db";
import { PermanentError } from "./errors";
import { getUnitsForMembers } from "./pool";
import type { RegisterEntry } from "./plan";

const PAGE_SIZE = 1000;
// A pool past this many members is beyond anything the API is sized for; the
// guard stops a bad cursor turning into an unbounded loop.
const MAX_PAGES = 20;

// Top-level poolMembers, not the nested pool { poolMembers } the admin page
// uses: the nested form cannot page past The Graph's skip ceiling. Ids are
// `poolMember-<pool>-<account>`, so an id_gt cursor with orderBy id pages
// cleanly. Zero-unit members are returned, which is why pruning has to read
// units rather than membership.
const POOL_MEMBERS_QUERY = gql`
  query PoolMembers($pool: String!, $cursor: String!, $first: Int!) {
    poolMembers(
      where: { pool: $pool, id_gt: $cursor }
      orderBy: id
      orderDirection: asc
      first: $first
    ) {
      id
      units
      account {
        id
      }
    }
  }
`;

export type IndexedMember = { address: string; units: bigint };

/**
 * Every address the indexer believes is a member of the pool, paginated.
 *
 * This is the only external source for the member list: the GDA has no way to
 * enumerate a pool's members on-chain, which is why the platform also keeps its
 * own record of what it wrote.
 */
export async function getIndexedMembers(
  chainId: number,
  poolAddress: Address,
): Promise<IndexedMember[]> {
  const client = getApolloClient("superfluid", chainId);
  const indexed: IndexedMember[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await client.query({
      query: POOL_MEMBERS_QUERY,
      variables: {
        pool: poolAddress.toLowerCase(),
        cursor,
        first: PAGE_SIZE,
      },
      fetchPolicy: "no-cache",
    });

    const members: { id: string; units: string; account: { id: string } }[] =
      data?.poolMembers ?? [];
    if (members.length === 0) return indexed;

    for (const member of members) {
      indexed.push({
        address: member.account.id.toLowerCase(),
        units: BigInt(member.units ?? 0),
      });
    }

    if (members.length < PAGE_SIZE) return indexed;
    cursor = members[members.length - 1].id;
  }

  // Returning the truncated list would report a register missing its tail, and
  // let a write leave those members' units standing while claiming it replaced
  // the whole thing. Refusing is the only honest answer.
  throw new PermanentError(
    `Pool ${poolAddress} on chain ${chainId} has more than ${MAX_PAGES * PAGE_SIZE} members, which is beyond what this API can enumerate`,
  );
}

/** Addresses the platform last wrote for this pool. */
export async function getMirroredAddresses(
  chainId: number,
  poolId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom("splitterWrittenRegister")
    .select(["address"])
    .where("chainId", "=", chainId)
    .where("poolId", "=", poolId)
    .execute();

  return rows.map((r) => r.address.toLowerCase());
}

/**
 * The pool's current register, as the platform can best determine it.
 *
 * Candidates come from the indexer, the platform's own mirror, and anything the
 * caller already knows about; units for all of them come from the chain. The
 * merge matters in both directions: the indexer alone can miss a recipient
 * added moments earlier, and verifying units on-chain catches wrong numbers but
 * cannot surface an address it was never told about.
 *
 * The mirror is a candidate-address source only. Units are never read from it,
 * so a human edit between API writes is corrected by the next write rather than
 * overwritten from stale data.
 */
export async function resolveCurrentRegister(
  network: Network,
  poolId: string,
  poolAddress: Address,
  extraAddresses: string[] = [],
): Promise<RegisterEntry[]> {
  const [indexed, mirrored] = await Promise.all([
    getIndexedMembers(network.id, poolAddress),
    getMirroredAddresses(network.id, poolId),
  ]);

  const candidates = [
    ...new Set([
      ...indexed.map((member) => member.address),
      ...mirrored,
      ...extraAddresses.map((a) => a.toLowerCase()),
    ]),
  ];

  const units = await getUnitsForMembers(network, poolAddress, candidates);

  return candidates
    .map((address) => ({ address, units: units.get(address) ?? 0n }))
    .sort((a, b) => a.address.localeCompare(b.address));
}
