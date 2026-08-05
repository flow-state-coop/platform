"use client";

import { useState, useEffect, useCallback } from "react";
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
        "Couldn't reach the server to check the payment. Check your connection and try again.",
    };
  }
}

/**
 * Pays for and claims the pool's one-time API unlock.
 *
 * `hasPendingPayment` is true while a broadcast payment has not been counted
 * by the server, which is the state the card renders as "find my payment"
 * rather than "pay". `checkPayment` retries the claim of that stored payment
 * and never pays; `claimTx` claims a hash the admin entered by hand, for when
 * the stored one was lost with the browser storage. `unlock` is the only path
 * that can move money, and even it claims an existing pending payment instead
 * of paying when it finds one.
 */
export function useUnlockPool(chainId: number, poolId: string) {
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient({ chainId });

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [hasPendingPayment, setHasPendingPayment] = useState(false);

  // localStorage is unavailable during server render, so the pending state is
  // read on mount and on a pool switch rather than in the initializer.
  useEffect(() => {
    setError("");
    setHasPendingPayment(!!readPendingTx(chainId, poolId));
  }, [chainId, poolId]);

  const settlePendingClaim = useCallback(
    async (
      txHash: string,
      onUnlocked?: () => Promise<unknown>,
    ): Promise<boolean> => {
      const claimed = await claim(chainId, poolId, txHash);

      if (claimed.ok) {
        clearPendingTx(chainId, poolId);
        setHasPendingPayment(false);
        await onUnlocked?.();
        return true;
      }

      if (PENDING_TX_DEAD_ERRORS.includes(claimed.error)) {
        clearPendingTx(chainId, poolId);
        setHasPendingPayment(false);
      }

      setError(claimed.error);
      return false;
    },
    [chainId, poolId],
  );

  // `onUnlocked` runs inside the unlocking window, so the caller can refresh
  // whatever reads the unlock status before the button re-enables.
  const checkPayment = useCallback(
    async (onUnlocked?: () => Promise<unknown>): Promise<boolean> => {
      const pending = readPendingTx(chainId, poolId);

      if (!pending) {
        setHasPendingPayment(false);
        return false;
      }

      try {
        setIsUnlocking(true);
        setError("");

        return await settlePendingClaim(pending, onUnlocked);
      } finally {
        setIsUnlocking(false);
      }
    },
    [chainId, poolId, settlePendingClaim],
  );

  const claimTx = useCallback(
    async (
      txHash: `0x${string}`,
      onUnlocked?: () => Promise<unknown>,
    ): Promise<boolean> => {
      try {
        setIsUnlocking(true);
        setError("");

        const claimed = await claim(chainId, poolId, txHash);

        if (!claimed.ok) {
          // The entered hash is not stored as pending: a typo held there
          // would hide the pay button behind a payment that never existed.
          setError(claimed.error);
          return false;
        }

        // A stored hash names a transfer that was broadcast and never counted.
        // Unlocking the pool with a different one does not make it disappear,
        // so it is claimed too before the only record of it is dropped, and the
        // payments table stays a complete account of what reached the bot. The
        // pool is already unlocked, so failing that claim costs the admin
        // nothing and must not fail the one they asked for.
        const pending = readPendingTx(chainId, poolId);
        if (pending && pending !== txHash) {
          await claim(chainId, poolId, pending);
        }

        clearPendingTx(chainId, poolId);
        setHasPendingPayment(false);
        await onUnlocked?.();

        return true;
      } finally {
        setIsUnlocking(false);
      }
    },
    [chainId, poolId],
  );

  const unlock = useCallback(
    async (onUnlocked?: () => Promise<unknown>): Promise<boolean> => {
      const usdc = SPLITTER_UNLOCK_USDC[chainId];

      if (!usdc) {
        setError("Payments are not configured for this network");
        return false;
      }

      if (!publicClient) {
        setError("Wallet not ready");
        return false;
      }

      try {
        setIsUnlocking(true);
        setError("");

        // Found here only through a race (another tab, stale state): a click
        // that discovers an unsettled payment claims it and stops, because
        // paying while one is outstanding is exactly the double charge the
        // stored hash exists to prevent.
        const pending = readPendingTx(chainId, poolId);
        if (pending) {
          setHasPendingPayment(true);
          return await settlePendingClaim(pending, onUnlocked);
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
        setHasPendingPayment(true);

        const receipt = await waitForReceipt(publicClient, hash);

        if (receipt.status === "reverted") {
          // A reverted transfer paid nothing, so there is no payment to guard.
          clearPendingTx(chainId, poolId);
          setHasPendingPayment(false);
          setError("The payment transaction reverted. Please try again.");
          return false;
        }

        return await settlePendingClaim(hash, onUnlocked);
      } catch (err) {
        console.error(err);

        // Reached from the wallet call or the receipt wait. If the transfer
        // was broadcast its hash is already stored and the card is showing
        // the recovery copy, which says everything there is to say.
        setError(
          readPendingTx(chainId, poolId)
            ? ""
            : "The payment was not sent. Please try again.",
        );

        return false;
      } finally {
        setIsUnlocking(false);
      }
    },
    [wagmiConfig, publicClient, chainId, poolId, settlePendingClaim],
  );

  return {
    unlock,
    checkPayment,
    claimTx,
    hasPendingPayment,
    isUnlocking,
    error,
  };
}
