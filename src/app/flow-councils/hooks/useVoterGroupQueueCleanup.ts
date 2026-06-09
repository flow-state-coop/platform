"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SIZE, splitIntoChunks } from "../lib/chunkQueue";
import type { VoterGroupQueueMeta } from "../membership/voterTableTypes";

// The members DELETE endpoint's per-request cap, not the 50/tx onchain CHUNK_SIZE.
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

type CleanupQueue = {
  clear: () => void;
  completedCount: number;
  totalCount: number;
  isPending: boolean;
  meta?: unknown;
};

export function useVoterGroupQueueCleanup(
  q: CleanupQueue,
  refresh: () => Promise<void> | void,
) {
  const [cleanupError, setCleanupError] = useState("");
  const clearCleanupError = useCallback(() => setCleanupError(""), []);

  const qRef = useRef(q);
  qRef.current = q;

  const queueDone =
    q.totalCount > 0 && q.completedCount === q.totalCount && !q.isPending;

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
      // Drop DB rows only after the onchain removal lands, else a failed queue
      // shows an empty group while voters still hold onchain power.
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

  // Reconcile the DB with what actually landed onchain in the committed prefix
  // (the first completedCount*CHUNK_SIZE entries), then clear the queue:
  //  - inserted adds PAST the prefix never landed, so their DB rows are rolled
  //    back (the adds within the prefix keep their membership);
  //  - removals WITHIN the prefix were already zeroed onchain, so their DB rows
  //    are dropped here (discard can't un-zero them) — otherwise they linger as
  //    counted-but-zero-power members. Removals past the prefix keep their full
  //    onchain power and DB membership untouched.
  const discard = useCallback(async () => {
    const cur = qRef.current;
    const meta = cur.meta as VoterGroupQueueMeta | undefined;

    if (meta) {
      const committedEntries = cur.completedCount * CHUNK_SIZE;
      const toDelete: string[] = [];

      if (meta.insertedAddresses.length > 0) {
        const committedAddCount = Math.min(
          committedEntries,
          meta.addedOrder.length,
        );
        const committed = new Set(meta.addedOrder.slice(0, committedAddCount));
        toDelete.push(
          ...meta.insertedAddresses.filter((addr) => !committed.has(addr)),
        );
      }

      if (meta.removalAddresses.length > 0) {
        const committedRemovalCount = Math.max(
          0,
          Math.min(
            committedEntries - meta.removalOffset,
            meta.removalAddresses.length,
          ),
        );
        toDelete.push(...meta.removalAddresses.slice(0, committedRemovalCount));
      }

      if (toDelete.length > 0) {
        // Await before clear(): clearing wipes the meta a retry would need.
        const failed = await deleteGroupMembers(meta, toDelete);

        if (failed.length > 0) {
          setCleanupError(
            "The transaction was discarded, but some voters could not be " +
              "cleared from this group's records. Refresh and remove them " +
              "again to retry.",
          );
        }
      }
    }

    cur.clear();
  }, []);

  return { discard, cleanupError, clearCleanupError };
}
