"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { Address } from "viem";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";

/**
 * Read from the chain rather than the subgraph: this decides whether writes can
 * work at all, and an unindexed grant would otherwise show as missing.
 *
 * Pinned to the pool's chain, not the wallet's. The splitter contract lives at
 * a different address on every chain, so an unpinned read from a wallet on
 * another network calls an address with no code and resolves to "no admin" for
 * a bot that does hold it. `botIsAdmin` is undefined until the read settles and
 * stays undefined if it fails, so callers can tell "no" from "don't know".
 */
export function useBotPoolAdmin(
  chainId: number,
  flowSplitter: Address | undefined,
  poolId: string,
) {
  const poolIdBigInt = useMemo(() => {
    try {
      return BigInt(poolId);
    } catch {
      return null;
    }
  }, [poolId]);

  const { data, isLoading, isError, refetch } = useReadContract({
    chainId,
    address: flowSplitter,
    abi: flowSplitterAbi,
    functionName: "isPoolAdmin",
    args: [poolIdBigInt ?? 0n, FLOW_STATE_BOT_ADDRESS],
    query: { enabled: poolIdBigInt !== null && !!flowSplitter },
  });

  return {
    botIsAdmin: typeof data === "boolean" ? data : undefined,
    isLoading,
    isError,
    refetch,
  };
}
