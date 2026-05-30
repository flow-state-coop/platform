"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Config } from "wagmi";
import type { PublicClient } from "viem";
import { writeContract } from "@wagmi/core";
import { waitForReceipt } from "@/lib/utils";
import { CHUNK_SIZE, splitIntoChunks } from "../lib/chunkQueue";

// Re-export so callers have a single import site for the chunking primitives
// and never duplicate the chunk size / splitting logic.
export { CHUNK_SIZE, splitIntoChunks };

// Persisted queues are keyed per council. An in-progress operation on one
// council is therefore never clobbered (or displayed) while viewing another —
// merely navigating between councils no longer discards a paused/incomplete
// queue, which previously caused silent data loss.
const STORAGE_KEY_PREFIX = "flow-council-tx-queue";

function storageKeyFor(councilId: string): string {
  return `${STORAGE_KEY_PREFIX}:${councilId.toLowerCase()}`;
}

// A single chunk is the second argument object passed to wagmi's
// `writeContract(config, args)` — i.e. { address, abi, functionName, args }.
// It is intentionally typed loosely (object) because the queue is generic over
// any contract call; the caller builds correctly-typed arg objects upstream.
type ChunkArgs = Record<string, unknown>;

type QueueChunk = {
  args: ChunkArgs;
};

export type QueueState = {
  councilId: string;
  chunks: QueueChunk[];
  completedCount: number;
};

// --- BigInt-safe (de)serialization ------------------------------------------
//
// wagmi writeContract args routinely contain BigInt values (e.g. a voter's
// `votingPower: BigInt(...)`), and BigInt is NOT JSON-serializable
// (JSON.stringify throws "Do not know how to serialize a BigInt"). We persist
// the queue as JSON in localStorage, so we wrap every value in a custom
// replacer/reviver that tags BigInts as `{ __bigint__: "<decimal string>" }`.
// On hydration the reviver turns that tag back into a real BigInt, so the
// rebuilt chunk args are byte-for-byte equivalent to what the caller passed —
// no need to know the arg shape or rebuild from raw voter data.

const BIGINT_TAG = "__bigint__";

function serializeQueue(state: QueueState): string {
  return JSON.stringify(state, (_key, value) =>
    typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value,
  );
}

function deserializeQueue(raw: string): QueueState | null {
  try {
    const parsed = JSON.parse(raw, (_key, value) => {
      if (
        value !== null &&
        typeof value === "object" &&
        typeof (value as Record<string, unknown>)[BIGINT_TAG] === "string"
      ) {
        return BigInt((value as Record<string, string>)[BIGINT_TAG]);
      }
      return value;
    }) as Partial<QueueState> | null;

    if (
      !parsed ||
      typeof parsed.councilId !== "string" ||
      !Array.isArray(parsed.chunks) ||
      typeof parsed.completedCount !== "number"
    ) {
      return null;
    }

    return {
      councilId: parsed.councilId,
      chunks: parsed.chunks as QueueChunk[],
      completedCount: parsed.completedCount,
    };
  } catch {
    return null;
  }
}

function persist(key: string, state: QueueState | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (state === null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, serializeQueue(state));
}

function loadPersisted(key: string): QueueState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(key);

  return raw ? deserializeQueue(raw) : null;
}

export function useChunkedTxQueue(
  config: Config,
  publicClient?: PublicClient,
  councilId?: string,
) {
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [isPending, setIsPending] = useState(false);
  // On hydration we never auto-resume — start paused so the parent can render a
  // resume banner instead of triggering surprise wallet prompts.
  const [isPaused, setIsPaused] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Refs mirror state so the recursive executeNext loop reads fresh values
  // without being re-created on every render (avoids stale closures).
  const queueRef = useRef<QueueState | null>(null);
  const isPausedRef = useRef(true);
  const isRunningRef = useRef(false);

  // Storage key tracks the current council; kept in a ref so the stable
  // setQueueState callback always persists under the right key.
  const storageKey = councilId ? storageKeyFor(councilId) : null;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const setQueueState = useCallback((next: QueueState | null) => {
    queueRef.current = next;
    setQueue(next);
    if (storageKeyRef.current) {
      persist(storageKeyRef.current, next);
    }
  }, []);

  const setPausedState = useCallback((paused: boolean) => {
    isPausedRef.current = paused;
    setIsPaused(paused);
  }, []);

  // Hydrate this council's persisted queue on mount (and whenever the council
  // changes, since the App Router reuses this component across [councilId]
  // params). NEVER auto-resume: leave isPaused=true. A queue that already
  // finished is discarded so a stale "100%" progress bar never rehydrates, and
  // any in-memory queue carried over from a previously-viewed council is reset.
  useEffect(() => {
    if (!storageKey) {
      return;
    }

    const persisted = loadPersisted(storageKey);

    if (persisted && persisted.completedCount < persisted.chunks.length) {
      queueRef.current = persisted;
      setQueue(persisted);
    } else {
      if (persisted) {
        persist(storageKey, null);
      }
      queueRef.current = null;
      setQueue(null);
    }

    setPausedState(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const executeNext = useCallback(async () => {
    // Guard against concurrent loops (e.g. resume called while one is running).
    if (isRunningRef.current) {
      return;
    }

    isRunningRef.current = true;
    setIsPending(true);

    try {
      // Loop instead of true recursion so we don't grow the call stack and so a
      // pause mid-flight is observed before each chunk. Continues while a queue
      // exists, isn't paused, and has unprocessed chunks remaining.
      let current = queueRef.current;

      while (
        current &&
        !isPausedRef.current &&
        current.completedCount < current.chunks.length
      ) {
        if (!publicClient) {
          throw new Error("Public client unavailable");
        }

        const index = current.completedCount;

        const chunk = current.chunks[index];

        const hash = await writeContract(
          config,
          // The persisted arg object is a valid writeContract parameter set; we
          // assert the type here because the queue is generic over contracts.
          chunk.args as Parameters<typeof writeContract>[1],
        );

        await waitForReceipt(publicClient, hash);

        const advanced: QueueState = {
          ...current,
          completedCount: current.completedCount + 1,
        };

        setQueueState(advanced);

        // Re-read from the ref so the next iteration sees the advanced count and
        // any pause/clear that arrived while the tx was settling.
        current = queueRef.current;
      }
    } catch (err) {
      // Stop without advancing; the failed chunk index stays at completedCount
      // so resume() retries it. Setting the same votingPower is idempotent.
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      isRunningRef.current = false;
      setIsPending(false);
    }
  }, [config, publicClient, setQueueState]);

  const startQueue = useCallback(
    (councilId: string, chunks: QueueChunk[]) => {
      const next: QueueState = { councilId, chunks, completedCount: 0 };

      setError(null);
      setQueueState(next);
      setPausedState(false);

      void executeNext();
    },
    [executeNext, setQueueState, setPausedState],
  );

  const resume = useCallback(() => {
    if (!queueRef.current) {
      return;
    }

    setError(null);
    setPausedState(false);

    void executeNext();
  }, [executeNext, setPausedState]);

  const pause = useCallback(() => {
    // Checked before each chunk in executeNext; an in-flight tx still settles.
    setPausedState(true);
  }, [setPausedState]);

  const clear = useCallback(() => {
    setPausedState(true);
    setError(null);
    setQueueState(null);
  }, [setQueueState, setPausedState]);

  return {
    startQueue,
    resume,
    pause,
    clear,
    isPending,
    isPaused,
    completedCount: queue?.completedCount ?? 0,
    totalCount: queue?.chunks.length ?? 0,
    councilId: queue?.councilId,
    error,
  };
}
