import { vi } from "vitest";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import { TEST_ADMIN_ADDRESS } from "./db";

// Chain simulator shared by the NFT voter-group integration suites. It backs a
// mocked viem `createPublicClient` / `createWalletClient` pair so routes can be
// driven end to end against the real database with no RPC.
//
// Reads and writes are recorded on the module state rather than asserted
// through vi.fn identities because the production code memoizes its clients per
// chain, so a client built in one test is reused by the next.

export const ERC721_INTERFACE_ID = "0x80ac58cd";
export const ERC1155_INTERFACE_ID = "0xd9b67a26";
export const ERC165_INVALID_INTERFACE_ID = "0xffffffff";

export const TX_HASH = `0x${"11".repeat(32)}`;

// Every simulated RPC failure carries provider detail that must never reach a
// client response. Tests assert this sentinel is absent from response bodies.
export const RPC_ERROR_SENTINEL = "rpc-secret-3f9c";
export const RPC_ERROR_MESSAGE = `HTTP request failed: https://provider.internal/v2/${RPC_ERROR_SENTINEL}`;

export type NftContractFixture =
  | { kind: "eoa" }
  | { kind: "erc721"; name?: string; holders?: string[] }
  | { kind: "erc1155"; name?: string; holders?: Record<string, string[]> }
  | { kind: "erc20"; name?: string }
  | { kind: "pre165Erc721"; name?: string; holders?: string[] }
  | { kind: "erc165Other"; name?: string }
  | { kind: "broken165"; name?: string };

type CallRecord = {
  address: string;
  functionName: string;
  args: readonly unknown[];
};

export const nftChain = {
  contracts: new Map<string, NftContractFixture>(),
  voters: new Map<string, bigint>(),
  botHasRole: true,
  managerAddress: TEST_ADMIN_ADDRESS,
  // `${address}:${functionName}` or `${address}:*`
  failReads: new Set<string>(),
  validSignatures: new Set<string>(),
  writeError: null as string | null,
  receiptError: null as string | null,
  reads: [] as CallRecord[],
  writes: [] as CallRecord[],
  receiptWaits: [] as string[],
  verifications: [] as {
    address: string;
    message: string;
    signature: string;
  }[],
};

export function resetNftChain() {
  nftChain.contracts.clear();
  nftChain.voters.clear();
  nftChain.botHasRole = true;
  nftChain.managerAddress = TEST_ADMIN_ADDRESS;
  nftChain.failReads.clear();
  nftChain.validSignatures.clear();
  nftChain.writeError = null;
  nftChain.receiptError = null;
  nftChain.reads = [];
  nftChain.writes = [];
  nftChain.receiptWaits = [];
  nftChain.verifications = [];
}

export function setContract(address: string, fixture: NftContractFixture) {
  nftChain.contracts.set(address.toLowerCase(), fixture);
}

export function setVotingPower(address: string, power: bigint) {
  nftChain.voters.set(address.toLowerCase(), power);
}

export function failRead(address: string, functionName = "*") {
  nftChain.failReads.add(`${address.toLowerCase()}:${functionName}`);
}

export function addValidSignature(signature: string) {
  nftChain.validSignatures.add(signature.toLowerCase());
}

/** viem surfaces a call into an address with no bytecode as this error name. */
class ContractFunctionZeroDataError extends Error {
  name = "ContractFunctionZeroDataError";
}

function isFailing(address: string, functionName: string) {
  return (
    nftChain.failReads.has(`${address}:${functionName}`) ||
    nftChain.failReads.has(`${address}:*`)
  );
}

function callContract(
  rawAddress: unknown,
  functionName: string,
  args: readonly unknown[],
): unknown {
  const address = String(rawAddress ?? "").toLowerCase();
  nftChain.reads.push({ address, functionName, args });

  if (isFailing(address, functionName)) {
    throw new Error(RPC_ERROR_MESSAGE);
  }

  if (functionName === "hasRole") {
    const account = String(args[1] ?? "").toLowerCase();
    if (account === FLOW_STATE_BOT_ADDRESS.toLowerCase()) {
      return nftChain.botHasRole;
    }
    return account === nftChain.managerAddress.toLowerCase();
  }

  if (functionName === "getVoter") {
    const account = String(args[0] ?? "").toLowerCase();
    return { votingPower: nftChain.voters.get(account) ?? 0n, votes: [] };
  }

  const fixture = nftChain.contracts.get(address);

  if (!fixture || fixture.kind === "eoa") {
    throw new ContractFunctionZeroDataError(
      `no bytecode at ${address} (${functionName})`,
    );
  }

  switch (functionName) {
    case "supportsInterface": {
      const id = String(args[0] ?? "").toLowerCase();
      if (fixture.kind === "erc721") return id === ERC721_INTERFACE_ID;
      if (fixture.kind === "erc1155") return id === ERC1155_INTERFACE_ID;
      if (fixture.kind === "erc165Other") return false;
      if (fixture.kind === "broken165") return true;
      throw new ContractFunctionZeroDataError(
        `${address} does not implement ERC-165`,
      );
    }

    case "name": {
      const name = "name" in fixture ? fixture.name : undefined;
      if (name === undefined) {
        throw new ContractFunctionZeroDataError(`${address} has no name()`);
      }
      return name;
    }

    case "decimals": {
      if (fixture.kind === "erc20") return 18;
      throw new ContractFunctionZeroDataError(`${address} has no decimals()`);
    }

    case "allowance": {
      if (fixture.kind === "erc20") return 0n;
      throw new ContractFunctionZeroDataError(`${address} has no allowance()`);
    }

    case "ownerOf": {
      if (fixture.kind === "erc721" || fixture.kind === "pre165Erc721") {
        // A revert proves the function exists; only zero data proves it does not.
        throw new Error("execution reverted: ERC721: invalid token ID");
      }
      throw new ContractFunctionZeroDataError(`${address} has no ownerOf()`);
    }

    case "balanceOf": {
      const owner = String(args[0] ?? "").toLowerCase();

      if (args.length === 1) {
        if (fixture.kind === "erc721" || fixture.kind === "pre165Erc721") {
          const holders = (fixture.holders ?? []).map((h) => h.toLowerCase());
          return holders.includes(owner) ? 1n : 0n;
        }
        if (fixture.kind === "erc20") return 0n;
        throw new ContractFunctionZeroDataError(
          `${address} has no balanceOf(address)`,
        );
      }

      if (fixture.kind === "erc1155") {
        const holders = fixture.holders ?? {};
        const owned = holders[owner] ?? [];
        return owned.includes(String(args[1])) ? 1n : 0n;
      }
      throw new ContractFunctionZeroDataError(
        `${address} has no balanceOf(address,uint256)`,
      );
    }

    default:
      throw new ContractFunctionZeroDataError(
        `${address} has no ${functionName}()`,
      );
  }
}

export function createNftMockPublicClient() {
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

    getCode: vi.fn(async ({ address }: { address: unknown }) => {
      const key = String(address ?? "").toLowerCase();
      nftChain.reads.push({ address: key, functionName: "getCode", args: [] });
      if (isFailing(key, "getCode")) {
        throw new Error(RPC_ERROR_MESSAGE);
      }
      const fixture = nftChain.contracts.get(key);
      if (!fixture || fixture.kind === "eoa") return undefined;
      return "0x60806040";
    }),

    verifyMessage: vi.fn(
      async ({
        address,
        message,
        signature,
      }: {
        address: unknown;
        message: string;
        signature: unknown;
      }) => {
        nftChain.verifications.push({
          address: String(address ?? "").toLowerCase(),
          message,
          signature: String(signature ?? ""),
        });
        return nftChain.validSignatures.has(
          String(signature ?? "").toLowerCase(),
        );
      },
    ),

    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => {
      nftChain.receiptWaits.push(hash);
      if (nftChain.receiptError) throw new Error(nftChain.receiptError);
      return { status: "success", transactionHash: hash };
    }),
  };
}

export function createNftMockWalletClient() {
  return {
    writeContract: vi.fn(
      async ({
        address,
        functionName,
        args = [],
      }: {
        address: unknown;
        functionName: string;
        args?: readonly unknown[];
      }) => {
        nftChain.writes.push({
          address: String(address ?? "").toLowerCase(),
          functionName,
          args,
        });
        if (nftChain.writeError) throw new Error(nftChain.writeError);
        return TX_HASH;
      },
    ),
  };
}
