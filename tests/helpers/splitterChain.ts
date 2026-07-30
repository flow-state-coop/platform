import { vi } from "vitest";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import { ChainBusyError } from "@/app/api/botLock";

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
  // What `isPoolAdmin` answers when the chain has moved ahead of the indexer.
  // Null keeps the two in step.
  chainAdmins: null as string[] | null,
  botIsAdmin: true,
  transferable: false,
  poolExists: true,
  // address -> units, the chain's view.
  units: new Map<string, bigint>(),
  // What the indexer reports as members, which can lag the chain.
  indexedMembers: [] as string[],
  writes: [] as { functionName: string; args: readonly unknown[] }[],
  writeError: null as string | null,
  // Losing the shared bot key's lease, which the runner treats as contention
  // rather than failure: nothing is broadcast and the job goes back to queued.
  chainBusy: false,
  // Fails the Nth write (1-based), for partial-write scenarios.
  failWriteNumber: 0,
  receiptStatus: "success" as "success" | "reverted",
  // Runs before each write settles, so a test can change state mid-job.
  // Awaited, so a hook that writes to the database lands before the job's next
  // batch rather than racing it.
  writeHook: null as ((writeNumber: number) => void | Promise<void>) | null,
  // Broadcast, no receipt, units not applied: what a stuck nonce looks like to
  // the attempt that resumes the job.
  stallWriteNumber: 0,
  pending: new Map<string, { account: string; units: bigint }[]>(),
  receipts: new Map<string, "success" | "reverted">(),
  // A pool with more members than the API will enumerate. Pages are generated
  // from the cursor rather than materialized.
  oversizedMemberCount: 0,
  // Extra addresses `isPool` answers true for. The pool under test always is
  // one, so these are the other pools an integrator might name as a recipient.
  otherPools: [] as string[],
};

export const SPLITTER_TX_HASH = `0x${"33".repeat(32)}`;

export function resetSplitterChain() {
  splitterChain.admins = [TEST_POOL_ADMIN.toLowerCase()];
  splitterChain.chainAdmins = null;
  splitterChain.botIsAdmin = true;
  splitterChain.transferable = false;
  splitterChain.poolExists = true;
  splitterChain.units = new Map();
  splitterChain.indexedMembers = [];
  splitterChain.writes = [];
  splitterChain.writeError = null;
  splitterChain.chainBusy = false;
  splitterChain.failWriteNumber = 0;
  splitterChain.receiptStatus = "success";
  splitterChain.writeHook = null;
  splitterChain.stallWriteNumber = 0;
  splitterChain.pending = new Map();
  splitterChain.receipts = new Map();
  splitterChain.oversizedMemberCount = 0;
  splitterChain.otherPools = [];
}

/** Mine what stalled broadcasts were carrying, as a cleared mempool would. */
export function mineStalledWrites() {
  for (const [hash, members] of splitterChain.pending) {
    for (const member of members) {
      setMember(member.account, member.units);
    }
    splitterChain.receipts.set(hash, "success");
  }

  splitterChain.pending.clear();
  splitterChain.stallWriteNumber = 0;
}

/**
 * Applies updateMembersUnits to the simulated chain, so a job converges the way
 * it would in production. New recipients become visible to the indexer too,
 * modelling an indexer that has caught up by the next read.
 */
export function createSplitterMockWalletClient() {
  return {
    writeContract: vi.fn(
      async ({
        functionName,
        args = [],
        nonce,
      }: {
        functionName: string;
        args?: readonly unknown[];
        nonce?: number;
      }) => {
        // Raised before the broadcast, as the lease does in production.
        if (splitterChain.chainBusy) {
          throw new ChainBusyError(TEST_SPLITTER_CHAIN_ID);
        }

        splitterChain.writes.push({ functionName, args });
        const writeNumber = splitterChain.writes.length;
        await splitterChain.writeHook?.(writeNumber);

        if (splitterChain.writeError) {
          throw new Error(splitterChain.writeError);
        }
        // Wrapped the way viem wraps a revert raised while simulating the call,
        // so the runner classifies it as it would in production. A bare Error
        // here would exercise the transient path instead.
        //
        // Imported here rather than at module scope: the routes' `vi.mock`
        // factory for viem imports this file, so a top-level viem import closes
        // that loop and the suite dies during module load.
        if (splitterChain.failWriteNumber === writeNumber) {
          const { ContractFunctionExecutionError, ExecutionRevertedError } =
            await import("viem");

          throw new ContractFunctionExecutionError(
            new ExecutionRevertedError({}),
            { abi: [], functionName },
          );
        }

        const members =
          functionName === "updateMembersUnits"
            ? ((args[1] ?? []) as { account: string; units: bigint }[])
            : [];
        const hash = `${SPLITTER_TX_HASH.slice(0, 60)}${String(nonce ?? 0).padStart(6, "0")}`;

        // On the wire and stuck there: no receipt, and the units stay as they
        // were until the mempool clears.
        if (splitterChain.stallWriteNumber === writeNumber) {
          splitterChain.pending.set(hash, members);
          return hash;
        }

        for (const member of members) {
          setMember(member.account, member.units);
        }
        splitterChain.receipts.set(hash, splitterChain.receiptStatus);

        return hash;
      },
    ),
  };
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
      return (splitterChain.chainAdmins ?? splitterChain.admins).includes(
        account,
      );
    }
    case "transferabilityForUnitsOwner":
      return splitterChain.transferable;
    case "getUnits": {
      const account = String(args[0] ?? "").toLowerCase();
      return splitterChain.units.get(account) ?? 0n;
    }
    case "isPool": {
      const account = String(args[1] ?? "").toLowerCase();
      return (
        account === TEST_POOL_ADDRESS.toLowerCase() ||
        splitterChain.otherPools.includes(account)
      );
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
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => {
      if (splitterChain.pending.has(hash)) {
        throw new Error(`Timed out while waiting for transaction ${hash}`);
      }

      return receiptFor(hash, splitterChain.receiptStatus);
    }),
    getTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => {
      const status = splitterChain.receipts.get(hash);
      if (!status) {
        throw new Error(`Transaction receipt for ${hash} could not be found`);
      }

      return receiptFor(hash, status);
    }),
    getTransaction: vi.fn(async ({ hash }: { hash: string }) => {
      if (!splitterChain.pending.has(hash)) {
        throw new Error(`Transaction ${hash} could not be found`);
      }

      return { hash, blockNumber: null };
    }),
  };
}

function receiptFor(hash: string, status: "success" | "reverted") {
  return {
    status,
    transactionHash: hash,
    gasUsed: 100_000n,
    effectiveGasPrice: 1_000_000n,
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

          // Addresses are the zero-padded index, so id order is index order and
          // the cursor decodes straight back to the next one.
          if (splitterChain.oversizedMemberCount > 0) {
            const next =
              cursor === "" ? 0 : Number(BigInt(`0x${cursor.slice(-40)}`)) + 1;
            const remaining = splitterChain.oversizedMemberCount - next;

            return {
              data: {
                poolMembers: Array.from(
                  { length: Math.max(0, Math.min(first, remaining)) },
                  (_, index) => {
                    const account = `0x${(next + index).toString(16).padStart(40, "0")}`;

                    return {
                      id: `poolMember-${pool}-${account}`,
                      account: { id: account },
                      units: "1",
                    };
                  },
                ),
              },
            };
          }

          // Units mirror the chain, modelling an indexer that has caught up.
          // A member zeroed on-chain stays a PoolMember entity at zero units,
          // which is what pruning has to distinguish.
          const rows = [...splitterChain.indexedMembers]
            .sort()
            .map((account) => ({
              id: `poolMember-${pool}-${account}`,
              account: { id: account },
              units: (splitterChain.units.get(account) ?? 0n).toString(),
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
