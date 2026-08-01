"use client";

import { useState, useCallback } from "react";
import { useConfig, usePublicClient } from "wagmi";
import { writeContract } from "@wagmi/core";
import { erc20Abi } from "viem";
import { waitForReceipt } from "@/lib/utils";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import {
  SPLITTER_UNLOCK_PRICE,
  SPLITTER_UNLOCK_USDC,
  UNLOCK_TX_NOT_PAYMENT_ERROR,
  UNLOCK_TX_REVERTED_ERROR,
  UNLOCK_TX_USED_ERROR,
} from "@/lib/splitterUnlock";

// A real payment can sit between the transfer confirming and the claim
// landing: the POST can fail on a network blip or a lapsed session, and paying
// again to retry would charge twice. The hash is stored the moment the wallet
// returns it and cleared only once the server has either counted it or said it
// can never count, so a retry claims the existing payment instead of sending a
// new one.
function storageKey(chainId: number, poolId: string) {
  return `splitterUnlockTx:${chainId}:${poolId}`;
}

function readPendingTx(chainId: number, poolId: string): string | null {
  try {
    return localStorage.getItem(storageKey(chainId, poolId));
  } catch {
    return null;
  }
}

function writePendingTx(chainId: number, poolId: string, hash: string) {
  try {
    localStorage.setItem(storageKey(chainId, poolId), hash);
  } catch {
    // Without storage the recovery path is unavailable, not the payment.
  }
}

function clearPendingTx(chainId: number, poolId: string) {
  try {
    localStorage.removeItem(storageKey(chainId, poolId));
  } catch {
    // Ditto.
  }
}

// Refusals that mean the stored transaction will never unlock this pool, so a
// fresh payment may proceed. Anything else (not confirmed yet, wrong signed-in
// wallet, a server error) leaves the hash in place and surfaces the message:
// paying again on an answer that could still change is how someone gets
// charged twice. Compared by identity against the shared constants.
const PENDING_TX_DEAD_ERRORS: string[] = [
  UNLOCK_TX_NOT_PAYMENT_ERROR,
  UNLOCK_TX_REVERTED_ERROR,
  UNLOCK_TX_USED_ERROR,
];

async function claim(
  chainId: number,
  poolId: string,
  txHash: string,
): Promise<{ ok: boolean; error: string }> {
  try {
    const res = await fetch("/api/flow-splitter/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId, poolId, txHash }),
    });
    const data = await res.json();

    if (data?.success) {
      return { ok: true, error: "" };
    }

    return {
      ok: false,
      error:
        typeof data?.error === "string"
          ? data.error
          : "Couldn't verify the payment. Please retry in a moment.",
    };
  } catch (err) {
    console.error(err);
    return {
      ok: false,
      error:
        "Couldn't verify the payment. Retry in a moment; a payment already sent will be found rather than charged again.",
    };
  }
}

export function useUnlockPool(chainId: number, poolId: string) {
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient({ chainId });

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");

  // `onUnlocked` runs inside the unlocking window, so the caller can refresh
  // whatever reads the unlock status before the button re-enables.
  const unlock = useCallback(
    async (onUnlocked?: () => Promise<unknown>): Promise<boolean> => {
      const usdc = SPLITTER_UNLOCK_USDC[chainId];

      if (!publicClient || !usdc) {
        setError("Wallet not ready");
        return false;
      }

      try {
        setIsUnlocking(true);
        setError("");

        const pending = readPendingTx(chainId, poolId);
        if (pending) {
          const claimed = await claim(chainId, poolId, pending);

          if (claimed.ok) {
            clearPendingTx(chainId, poolId);
            await onUnlocked?.();
            return true;
          }

          if (!PENDING_TX_DEAD_ERRORS.includes(claimed.error)) {
            setError(claimed.error);
            return false;
          }

          clearPendingTx(chainId, poolId);
        }

        // Pinned to the pool's chain so wagmi refuses a wallet on the wrong
        // network instead of paying an address that means nothing there.
        const hash = await writeContract(wagmiConfig, {
          chainId,
          address: usdc,
          abi: erc20Abi,
          functionName: "transfer",
          args: [FLOW_STATE_BOT_ADDRESS, SPLITTER_UNLOCK_PRICE],
        });

        writePendingTx(chainId, poolId, hash);

        const receipt = await waitForReceipt(publicClient, hash);

        if (receipt.status === "reverted") {
          // A reverted transfer paid nothing, so there is no payment to guard.
          clearPendingTx(chainId, poolId);
          setError("The payment transaction reverted. Please try again.");
          return false;
        }

        const claimed = await claim(chainId, poolId, hash);

        if (!claimed.ok) {
          setError(claimed.error);
          return false;
        }

        clearPendingTx(chainId, poolId);
        await onUnlocked?.();

        return true;
      } catch (err) {
        console.error(err);

        // Reached from the wallet call or the receipt wait. If the transfer
        // was broadcast its hash is already stored, so the next attempt claims
        // it rather than paying again.
        setError(
          readPendingTx(chainId, poolId)
            ? "Couldn't confirm the payment. Retry in a moment; a payment already sent will be found rather than charged again."
            : "The payment was not sent. Please try again.",
        );

        return false;
      } finally {
        setIsUnlocking(false);
      }
    },
    [wagmiConfig, publicClient, chainId, poolId],
  );

  return { unlock, isUnlocking, error };
}
