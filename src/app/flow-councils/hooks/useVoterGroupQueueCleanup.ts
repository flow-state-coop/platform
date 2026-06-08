"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SIZE, splitIntoChunks } from "../lib/chunkQueue";
import type { VoterGroupQueueMeta } from "../membership/voterTableTypes";

// Drop the queue's DB membership rows in batches sized to the members DELETE
// endpoint's per-request cap (not the 50/tx onchain CHUNK_SIZE). Each batch is
// independent; failed batches are collected and returned so the rest still run.
const DELETE_BATCH = 1000;

async function deleteGroupMembers(
  meta: VoterGroupQueueMeta,
  addresses: string[],
): Promise<string[]> {
  const failed: string[] = [];

  for (const batch of splitIntoChunks(addresses, DELETE_BATCH)) {
    try {
      const res = await fetch("/api/flow-council/voter-groups/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: meta.chainId,
          councilId: meta.councilId,
          groupId: meta.groupId,
          addresses: batch,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        failed.push(...batch);
      }
    } catch (err) {
      console.error(err);
      failed.push(...batch);
    }
  }

  return failed;
}

// The slice of the chunked-tx-queue hook this cleanup needs.
type CleanupQueue = {
  clear: () => void;
  completedCount: number;
  totalCount: number;
  isPending: boolean;
  meta?: unknown;
};

/**
 * Ties the voter-group DB cleanup to the lifecycle of the onchain chunk queue,
 * reading everything it needs from the queue's persisted `meta`. Because that
 * data lives in localStorage (not a component ref), both finalize and rollback
 * work after a navigation/remount and from whichever page (overview or detail)
 * mounts the queue — so resuming or discarding from the cross-navigation banner
 * cleans up the DB just like the in-session modal does.
 */
export function useVoterGroupQueueCleanup(
  q: CleanupQueue,
  refresh: () => Promise<void> | void,
) {
  const [cleanupError, setCleanupError] = useState("");
  const clearCleanupError = useCallback(() => setCleanupError(""), []);

  // Mirror the live queue so `discard` reads fresh values without rebinding.
  const qRef = useRef(q);
  qRef.current = q;

  const queueDone =
    q.totalCount > 0 && q.completedCount === q.totalCount && !q.isPending;

  // Runs exactly once per completed queue: a fresh startQueue flips queueDone
  // back to false and resets the guard.
  const finalizedRef = useRef(false);

  useEffect(() => {
    if (!queueDone) {
      finalizedRef.current = false;
      return;
    }

    if (finalizedRef.current) {
      return;
    }

    finalizedRef.current = true;

    const meta = q.meta as VoterGroupQueueMeta | undefined;
    let cancelled = false;

    const finalize = async () => {
      // The onchain removal has fully landed; only now drop the DB rows, so a
      // paused/failed queue never shows a group as empty while the voters still
      // hold onchain voting power.
      if (meta && meta.removalAddresses.length > 0) {
        const failed = await deleteGroupMembers(meta, meta.removalAddresses);

        if (failed.length > 0 && !cancelled) {
          setCleanupError(
            `Voters were removed onchain, but ${failed.length} could not be ` +
              `cleared from this group's records. Refresh and remove them ` +
              `again to retry.`,
          );
        }
      }

      if (!cancelled) {
        await refresh();
      }
    };

    finalize();

    return () => {
      cancelled = true;
    };
  }, [queueDone, q.meta, refresh]);

  // Discard a stopped/incomplete queue. Adds sit at the front of the onchain
  // entries, so the first completedCount*CHUNK_SIZE that landed keep their DB
  // membership; only the inserted rows beyond that committed prefix are rolled
  // back, so a partial multi-chunk failure can't strand a voter with onchain
  // power but no group. Best-effort; a failure surfaces on cleanupError.
  const discard = useCallback(() => {
    const cur = qRef.current;
    const meta = cur.meta as VoterGroupQueueMeta | undefined;

    if (meta && meta.insertedAddresses.length > 0) {
      const committedAddCount = Math.min(
        cur.completedCount * CHUNK_SIZE,
        meta.addedOrder.length,
      );
      const committed = new Set(meta.addedOrder.slice(0, committedAddCount));
      const rollback = meta.insertedAddresses.filter(
        (addr) => !committed.has(addr),
      );

      if (rollback.length > 0) {
        void (async () => {
          const failed = await deleteGroupMembers(meta, rollback);

          if (failed.length > 0) {
            setCleanupError(
              "The transaction was discarded, but some newly added voters " +
                "could not be cleared from this group. Refresh and remove " +
                "them to retry.",
            );
          }
        })();
      }
    }

    cur.clear();
  }, []);

  return { discard, cleanupError, clearCleanupError };
}
