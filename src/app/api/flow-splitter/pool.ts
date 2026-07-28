import { gql } from "@apollo/client";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { getApolloClient } from "@/lib/apollo";
import { getViemChain, networks } from "@/lib/networks";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import type { Network } from "@/types/network";

const GDA_POOL_ABI = parseAbi([
  "function transferabilityForUnitsOwner() view returns (bool)",
  "function getUnits(address memberAddress) view returns (uint128)",
]);

// A single multicall over an unbounded member list would blow past the
// provider's response limits on a large register.
const UNITS_CHUNK_SIZE = 250;

const POOL_QUERY = gql`
  query SplitterPool($poolId: String!) {
    pools(where: { id: $poolId }) {
      poolAddress
      name
      symbol
      token
      metadata
      poolAdmins {
        address
      }
    }
  }
`;

export type SplitterPool = {
  poolAddress: Address;
  name: string;
  symbol: string;
  token: Address;
  metadata: unknown;
  adminAddresses: string[];
};

const publicClientCache = new Map<
  number,
  ReturnType<typeof createPublicClient>
>();

/**
 * Read-only client per chain. Separate from the bot signer so pool reads never
 * depend on FLOW_STATE_ELIGIBILITY_PK being configured.
 */
export function getSplitterPublicClient(network: Network) {
  const cached = publicClientCache.get(network.id);
  if (cached) return cached;

  const client = createPublicClient({
    chain: getViemChain(network.id),
    transport: http(process.env[`RPC_URL_${network.id}`] || network.rpcUrl),
  });
  publicClientCache.set(network.id, client);
  return client;
}

export function getNetwork(chainId: number): Network | undefined {
  return networks.find((n) => n.id === chainId);
}

/**
 * The splitter subgraph keys pools by their hex-encoded id, which is what the
 * admin page uses too.
 */
function subgraphPoolId(poolId: string): string {
  return `0x${BigInt(poolId).toString(16)}`;
}

export async function getPoolFromSubgraph(
  chainId: number,
  poolId: string,
): Promise<SplitterPool | null> {
  const { data } = await getApolloClient("flowSplitter", chainId).query({
    query: POOL_QUERY,
    variables: { poolId: subgraphPoolId(poolId) },
    fetchPolicy: "no-cache",
  });

  const pool = data?.pools?.[0];
  if (!pool) return null;

  return {
    poolAddress: pool.poolAddress as Address,
    name: pool.name,
    symbol: pool.symbol,
    token: pool.token as Address,
    metadata: pool.metadata,
    adminAddresses: (pool.poolAdmins ?? []).map((a: { address: string }) =>
      a.address.toLowerCase(),
    ),
  };
}

/**
 * Admin status straight from the chain, never from the subgraph or the page's
 * form state: this decides whether the bot can write, and a stale indexer would
 * either burn gas on a revert or hide a working integration.
 */
export async function isPoolAdmin(
  network: Network,
  poolId: string,
  account: Address,
): Promise<boolean> {
  return getSplitterPublicClient(network).readContract({
    address: network.flowSplitter as Address,
    abi: flowSplitterAbi,
    functionName: "isPoolAdmin",
    args: [BigInt(poolId), account],
  }) as Promise<boolean>;
}

export function isBotPoolAdmin(network: Network, poolId: string) {
  return isPoolAdmin(network, poolId, FLOW_STATE_BOT_ADDRESS);
}

const transferabilityCache = new Map<string, boolean>();

/**
 * Read from the GDA pool, not the FlowSplitter, and fixed when the pool is
 * created, so it is safe to memoize for the process lifetime. Recipients of a
 * transferable pool can move units to arbitrary addresses between writes, which
 * is why those pools are excluded from the API entirely.
 */
export async function isTransferable(
  network: Network,
  poolAddress: Address,
): Promise<boolean> {
  const key = `${network.id}:${poolAddress.toLowerCase()}`;
  const cached = transferabilityCache.get(key);
  if (cached !== undefined) return cached;

  const transferable = (await getSplitterPublicClient(network).readContract({
    address: poolAddress,
    abi: GDA_POOL_ABI,
    functionName: "transferabilityForUnitsOwner",
  })) as boolean;

  transferabilityCache.set(key, transferable);
  return transferable;
}

/**
 * Current units for a set of members, read from the GDA pool. This is the only
 * authoritative source for share counts: Superfluid cannot enumerate a pool's
 * members, so the candidate addresses come from elsewhere and their numbers
 * come from here.
 */
export async function getUnitsForMembers(
  network: Network,
  poolAddress: Address,
  addresses: string[],
): Promise<Map<string, bigint>> {
  const units = new Map<string, bigint>();
  if (addresses.length === 0) return units;

  const client = getSplitterPublicClient(network);

  for (let i = 0; i < addresses.length; i += UNITS_CHUNK_SIZE) {
    const chunk = addresses.slice(i, i + UNITS_CHUNK_SIZE);
    const results = (await client.multicall({
      allowFailure: false,
      contracts: chunk.map((address) => ({
        address: poolAddress,
        abi: GDA_POOL_ABI,
        functionName: "getUnits" as const,
        args: [address as Address],
      })),
    })) as unknown as bigint[];

    chunk.forEach((address, index) => {
      units.set(address.toLowerCase(), BigInt(results[index]));
    });
  }

  return units;
}
