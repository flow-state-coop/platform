"use client";

import { useState, useCallback } from "react";
import { useConfig, usePublicClient } from "wagmi";
import { writeContract } from "@wagmi/core";
import { Address } from "viem";
import { waitForReceipt } from "@/lib/utils";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import {
  VOTER_MANAGER_ROLE,
  FLOW_STATE_BOT_ADDRESS,
} from "@/app/flow-councils/lib/constants";

export function useGrantBotVoterManager(councilId: string) {
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();

  const [isGranting, setIsGranting] = useState(false);
  const [error, setError] = useState("");

  const grant = useCallback(async (): Promise<boolean> => {
    if (!publicClient) {
      setError("Wallet not ready");
      return false;
    }

    try {
      setIsGranting(true);
      setError("");

      const hash = await writeContract(wagmiConfig, {
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateManagers",
        args: [
          [
            {
              account: FLOW_STATE_BOT_ADDRESS,
              role: VOTER_MANAGER_ROLE,
              status: 0, // Status.ADDED
            },
          ],
        ],
      });

      await waitForReceipt(publicClient, hash);

      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to grant the bot role. Please try again.");

      return false;
    } finally {
      setIsGranting(false);
    }
  }, [wagmiConfig, publicClient, councilId]);

  return { grant, isGranting, error, setError };
}
