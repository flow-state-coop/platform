import { vi } from "vitest";

// Chain simulator for the routes that sign with the shared Flow State bot key.
// It backs a mocked viem `createPublicClient` / `createWalletClient` pair so a
// route can be driven end to end against the real database with no RPC.
//
// Every send is recorded with the nonce it carried, which is what the
// sequencing fix is asserted on: two sends on one chain must never be handed
// the same number.
//
// Reads are dispatched by function name through handlers a suite registers, so
// each route declares only the contract surface it actually touches.

export const TX_HASH = `0x${"22".repeat(32)}`;

// Simulated RPC failures carry provider detail that must never reach a client
// response; suites assert this sentinel is absent from response bodies.
export const RPC_ERROR_SENTINEL = "rpc-secret-8c14";
export const RPC_ERROR_MESSAGE = `HTTP request failed: https://provider.internal/v2/${RPC_ERROR_SENTINEL}`;

type CallRecord = {
  address: string;
  functionName: string;
  args: readonly unknown[];
  nonce?: number;
};

type ReadHandler = (args: readonly unknown[]) => unknown;

export const botChain = {
  reads: [] as CallRecord[],
  writes: [] as CallRecord[],
  receiptWaits: [] as string[],
  handlers: new Map<string, ReadHandler>(),
  pendingNonce: 0,
  writeError: null as string | null,
  // Runs on every write before it settles, letting a suite land a concurrent
  // change between a route's read and its receipt.
  writeHook: null as (() => void) | null,
  receiptStatus: "success" as "success" | "reverted",
  receiptError: null as string | null,
};

export function resetBotChain() {
  botChain.reads = [];
  botChain.writes = [];
  botChain.receiptWaits = [];
  botChain.handlers.clear();
  botChain.pendingNonce = 0;
  botChain.writeError = null;
  botChain.writeHook = null;
  botChain.receiptStatus = "success";
  botChain.receiptError = null;
}

/** Register the return value for a contract read, by function name. */
export function onRead(functionName: string, handler: ReadHandler) {
  botChain.handlers.set(functionName, handler);
}

function callContract(
  rawAddress: unknown,
  functionName: string,
  args: readonly unknown[],
): unknown {
  const address = String(rawAddress ?? "").toLowerCase();
  botChain.reads.push({ address, functionName, args });

  const handler = botChain.handlers.get(functionName);
  if (!handler) {
    throw new Error(`botChain has no handler for ${functionName}()`);
  }
  return handler(args);
}

export function createBotMockPublicClient() {
  return {
    readContract: vi.fn(
      async ({
        address,
        functionName,
        args = [],
      }: {
        address: unknown;
        functionName: string;
        args?: readonly unknown[];
      }) => callContract(address, functionName, args),
    ),

    multicall: vi.fn(
      async ({
        contracts,
        allowFailure = true,
      }: {
        contracts: {
          address: unknown;
          functionName: string;
          args?: readonly unknown[];
        }[];
        allowFailure?: boolean;
      }) =>
        contracts.map((contract) => {
          try {
            const result = callContract(
              contract.address,
              contract.functionName,
              contract.args ?? [],
            );
            return allowFailure ? { status: "success", result } : result;
          } catch (err) {
            if (!allowFailure) throw err;
            return { status: "failure", error: err };
          }
        }),
    ),

    getTransactionCount: vi.fn(async () => botChain.pendingNonce),

    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => {
      botChain.receiptWaits.push(hash);
      if (botChain.receiptError) throw new Error(botChain.receiptError);
      return { status: botChain.receiptStatus, transactionHash: hash };
    }),
  };
}

export function createBotMockWalletClient() {
  return {
    writeContract: vi.fn(
      async ({
        address,
        functionName,
        args = [],
        nonce,
      }: {
        address: unknown;
        functionName: string;
        args?: readonly unknown[];
        nonce?: number;
      }) => {
        botChain.writes.push({
          address: String(address ?? "").toLowerCase(),
          functionName,
          args,
          nonce,
        });
        botChain.writeHook?.();
        if (botChain.writeError) throw new Error(botChain.writeError);
        return TX_HASH;
      },
    ),
  };
}
