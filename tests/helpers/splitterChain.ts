import { vi } from "vitest";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";

// Chain + subgraph simulator for the Flow Splitter API routes. Backs a mocked
// viem public client and a mocked Apollo client so routes run end to end
// against the real database with no RPC and no indexer.

export const TEST_POOL_ID = "42";
export const TEST_POOL_ADDRESS = "0x1234567890123456789012345678901234567890";
export const TEST_TOKEN_ADDRESS = "0x0987654321098765432109876543210987654321";
export const TEST_POOL_ADMIN = "0x2222222222222222222222222222222222222222";
export const TEST_SPLITTER_CHAIN_ID = 10;

export const splitterChain = {
  // Empty means the pool has no admins, so it is permanently immutable.
  admins: [TEST_POOL_ADMIN.toLowerCase()] as string[],
  botIsAdmin: true,
  transferable: false,
  poolExists: true,
  // address -> units, the chain's view.
  units: new Map<string, bigint>(),
  // What the indexer reports as members, which can lag the chain.
  indexedMembers: [] as string[],
  writes: [] as { functionName: string; args: readonly unknown[] }[],
};

export function resetSplitterChain() {
  splitterChain.admins = [TEST_POOL_ADMIN.toLowerCase()];
  splitterChain.botIsAdmin = true;
  splitterChain.transferable = false;
  splitterChain.poolExists = true;
  splitterChain.units = new Map();
  splitterChain.indexedMembers = [];
  splitterChain.writes = [];
}

/** Put an address in the pool, visible to both the chain and the indexer. */
export function setMember(address: string, units: bigint) {
  splitterChain.units.set(address.toLowerCase(), units);
  if (!splitterChain.indexedMembers.includes(address.toLowerCase())) {
    splitterChain.indexedMembers.push(address.toLowerCase());
  }
}

/** Units on-chain that the indexer has not caught up to yet. */
export function setUnindexedMember(address: string, units: bigint) {
  splitterChain.units.set(address.toLowerCase(), units);
}

function readContract({
  functionName,
  args = [],
}: {
  functionName: string;
  args?: readonly unknown[];
}): unknown {
  switch (functionName) {
    case "isPoolAdmin": {
      const account = String(args[1] ?? "").toLowerCase();
      if (account === FLOW_STATE_BOT_ADDRESS.toLowerCase()) {
        return splitterChain.botIsAdmin;
      }
      return splitterChain.admins.includes(account);
    }
    case "transferabilityForUnitsOwner":
      return splitterChain.transferable;
    case "getUnits": {
      const account = String(args[0] ?? "").toLowerCase();
      return splitterChain.units.get(account) ?? 0n;
    }
    default:
      throw new Error(`splitterChain has no handler for ${functionName}()`);
  }
}

export function createSplitterMockPublicClient() {
  return {
    readContract: vi.fn(async (params: Parameters<typeof readContract>[0]) =>
      readContract(params),
    ),
    multicall: vi.fn(
      async ({
        contracts,
        allowFailure = true,
      }: {
        contracts: { functionName: string; args?: readonly unknown[] }[];
        allowFailure?: boolean;
      }) =>
        contracts.map((contract) => {
          const result = readContract(contract);
          return allowFailure ? { status: "success", result } : result;
        }),
    ),
    getTransactionCount: vi.fn(async () => 0),
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => ({
      status: "success",
      transactionHash: hash,
      gasUsed: 100_000n,
      effectiveGasPrice: 1_000_000n,
    })),
  };
}

/**
 * Stands in for both subgraphs the API reads: the splitter's pool record and
 * Superfluid's pool members. Members are returned in id order and paged with an
 * id_gt cursor, matching the real entity.
 */
export function createSplitterMockApolloClient() {
  return {
    query: vi.fn(
      async ({
        variables = {},
      }: {
        query: unknown;
        variables?: Record<string, unknown>;
      }) => {
        if ("cursor" in variables) {
          const pool = String(variables.pool ?? "");
          const cursor = String(variables.cursor ?? "");
          const first = Number(variables.first ?? 1000);

          const rows = [...splitterChain.indexedMembers]
            .sort()
            .map((account) => ({
              id: `poolMember-${pool}-${account}`,
              account: { id: account },
            }))
            .filter((row) => row.id > cursor)
            .slice(0, first);

          return { data: { poolMembers: rows } };
        }

        if (!splitterChain.poolExists) return { data: { pools: [] } };

        return {
          data: {
            pools: [
              {
                poolAddress: TEST_POOL_ADDRESS,
                name: "Test Splitter",
                symbol: "TEST",
                token: TEST_TOKEN_ADDRESS,
                metadata: null,
                poolAdmins: splitterChain.admins.map((address) => ({
                  address,
                })),
              },
            ],
          },
        };
      },
    ),
  };
}
