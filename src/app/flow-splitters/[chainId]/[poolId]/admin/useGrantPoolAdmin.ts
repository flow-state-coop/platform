"use client";

import { useState, useCallback } from "react";
import { useConfig, usePublicClient } from "wagmi";
import { writeContract } from "@wagmi/core";
import { Address } from "viem";
import { waitForReceipt } from "@/lib/utils";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";

// addPoolAdmin, not grantRole: the public grantRole reverts because nobody
// holds DEFAULT_ADMIN_ROLE on the splitter contract.
export function useGrantPoolAdmin(
  chainId: number,
  flowSplitter: Address | undefined,
  poolId: string,
) {
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient({ chainId });

  const [isGranting, setIsGranting] = useState(false);
  const [error, setError] = useState("");

  const grant = useCallback(async (): Promise<boolean> => {
    if (!publicClient || !flowSplitter) {
      setError("Wallet not ready");
      return false;
    }

    try {
      setIsGranting(true);
      setError("");

      // Pinned to the pool's chain so wagmi refuses a wallet on the wrong
      // network instead of sending to an unrelated address that happens to
      // share it.
      const hash = await writeContract(wagmiConfig, {
        chainId,
        address: flowSplitter,
        abi: flowSplitterAbi,
        functionName: "addPoolAdmin",
        args: [BigInt(poolId), FLOW_STATE_BOT_ADDRESS],
      });

      // waitForTransactionReceipt resolves on a revert rather than throwing, so
      // without this a reverted grant would report success and the card would
      // claim the bot has access it does not have.
      const receipt = await waitForReceipt(publicClient, hash);

      if (receipt.status === "reverted") {
        setError("The grant transaction reverted. Please try again.");
        return false;
      }

      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to grant admin access. Please try again.");

      return false;
    } finally {
      setIsGranting(false);
    }
  }, [wagmiConfig, publicClient, chainId, flowSplitter, poolId]);

  return { grant, isGranting, error };
}
