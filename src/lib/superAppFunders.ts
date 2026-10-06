import { type Address, parseAbi } from "viem";
import { superAppSplitterAbi } from "@/lib/abi/superAppSplitter";
import type { Network } from "@/types/network";

export type SuperAppFunderData = {
  totalInflowRate: string;
  totalNetFlowRate: string;
  totalAmountStreamedInUntilUpdatedAt: string;
  updatedAtTimestamp: number;
  funderCount: number;
};

export type IndexedSuperAppFunders = SuperAppFunderData & {
  senders: string[];
};

export type OnChainSuperAppFunders = {
  inflowRate: bigint;
  netFlowRate: bigint;
  feePermille: bigint;
  senderFlowRates: bigint[];
};

export type SuperAppPoolTotals = {
  totalAmountFlowedDistributedUntilUpdatedAt: string;
  updatedAtTimestamp: number;
};

type ReadResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error?: unknown }
  | undefined;

const cfaForwarderReadsAbi = parseAbi([
  "function getAccountFlowrate(address token, address account) view returns (int96)",
  "function getFlowrate(address token, address sender, address receiver) view returns (int96)",
]);

const gdaForwarderReadsAbi = parseAbi([
  "function getNetFlow(address token, address account) view returns (int96)",
]);

const FIXED_READS_COUNT = 3;

export function superAppFunderReads({
  network,
  splitterAddress,
  tokenAddress,
  senders,
}: {
  network: Network;
  splitterAddress: Address;
  tokenAddress: Address;
  senders: string[];
}) {
  return [
    {
      address: network.cfaForwarder,
      abi: cfaForwarderReadsAbi,
      functionName: "getAccountFlowrate",
      args: [tokenAddress, splitterAddress],
      chainId: network.id,
    },
    {
      address: network.gdaForwarder,
      abi: gdaForwarderReadsAbi,
      functionName: "getNetFlow",
      args: [tokenAddress, splitterAddress],
      chainId: network.id,
    },
    {
      address: splitterAddress,
      abi: superAppSplitterAbi,
      functionName: "FEE_PORTION",
      chainId: network.id,
    },
    ...senders.map((sender) => ({
      address: network.cfaForwarder,
      abi: cfaForwarderReadsAbi,
      functionName: "getFlowrate",
      args: [tokenAddress, sender as Address, splitterAddress],
      chainId: network.id,
    })),
  ];
}

function bigintResult(read: ReadResult): bigint | undefined {
  return read?.status === "success" ? BigInt(read.result as bigint) : undefined;
}

export function parseSuperAppFunderReads(
  reads: readonly ReadResult[] | undefined,
  senderCount: number,
): OnChainSuperAppFunders | undefined {
  if (!reads || reads.length < FIXED_READS_COUNT + senderCount) {
    return undefined;
  }

  const inflowRate = bigintResult(reads[0]);
  const gdaNetFlowRate = bigintResult(reads[1]);
  const feePermille = bigintResult(reads[2]);
  const senderFlowRates = reads
    .slice(FIXED_READS_COUNT, FIXED_READS_COUNT + senderCount)
    .map(bigintResult);

  if (
    inflowRate === undefined ||
    gdaNetFlowRate === undefined ||
    feePermille === undefined ||
    senderFlowRates.some((rate) => rate === undefined)
  ) {
    return undefined;
  }

  return {
    inflowRate: inflowRate > 0n ? inflowRate : 0n,
    netFlowRate: inflowRate + gdaNetFlowRate,
    feePermille,
    senderFlowRates: senderFlowRates as bigint[],
  };
}

function toFunderData(indexed: IndexedSuperAppFunders): SuperAppFunderData {
  return {
    totalInflowRate: indexed.totalInflowRate,
    totalNetFlowRate: indexed.totalNetFlowRate,
    totalAmountStreamedInUntilUpdatedAt:
      indexed.totalAmountStreamedInUntilUpdatedAt,
    updatedAtTimestamp: indexed.updatedAtTimestamp,
    funderCount: indexed.funderCount,
  };
}

// The Superfluid subgraph can drop CFA events on some chains, leaving the
// splitter's inflow snapshot and its sender list behind the chain. The chain
// is authoritative for the rate and for which listed senders still stream;
// senders the indexer never saw show up as inflow the listed ones don't
// account for, so the count is a lower bound. The total streamed in is
// derived from the pool's distribution, which is the inflow minus the fee.
export function reconcileSuperAppFunders({
  indexed,
  onChain,
  pool,
}: {
  indexed: IndexedSuperAppFunders | undefined;
  onChain: OnChainSuperAppFunders | undefined;
  pool: SuperAppPoolTotals | undefined;
}): SuperAppFunderData | undefined {
  if (!onChain) {
    return indexed ? toFunderData(indexed) : undefined;
  }

  const indexedSenders = indexed?.senders ?? [];
  const activeSenderRates = onChain.senderFlowRates.filter((rate) => rate > 0n);
  const isIndexerStale =
    !indexed ||
    BigInt(indexed.totalInflowRate) !== onChain.inflowRate ||
    activeSenderRates.length !== indexedSenders.length;

  if (!isIndexerStale) {
    return toFunderData(indexed);
  }

  if (!indexed && onChain.inflowRate === 0n) {
    return undefined;
  }

  const accountedInflowRate = activeSenderRates.reduce(
    (sum, rate) => sum + rate,
    0n,
  );
  const hasUnindexedSenders = onChain.inflowRate > accountedInflowRate;
  const poolPermille = 1000n - onChain.feePermille;
  const totalStreamedIn =
    pool && poolPermille > 0n
      ? (
          (BigInt(pool.totalAmountFlowedDistributedUntilUpdatedAt) * 1000n) /
          poolPermille
        ).toString()
      : (indexed?.totalAmountStreamedInUntilUpdatedAt ?? "0");

  return {
    totalInflowRate: onChain.inflowRate.toString(),
    totalNetFlowRate: onChain.netFlowRate.toString(),
    totalAmountStreamedInUntilUpdatedAt: totalStreamedIn,
    updatedAtTimestamp: pool
      ? pool.updatedAtTimestamp
      : (indexed?.updatedAtTimestamp ?? 0),
    funderCount: activeSenderRates.length + (hasUnindexedSenders ? 1 : 0),
  };
}
