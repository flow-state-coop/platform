// Persisted shape and (de)serialization for the chunked onchain tx queue
// (useChunkedTxQueue). Kept framework-free and side-effect free — it touches no
// window/localStorage — so the BigInt round-trip can be unit tested directly.

// A single chunk is the second argument object passed to wagmi's
// `writeContract(config, args)` — i.e. { address, abi, functionName, args }.
// It is intentionally typed loosely (object) because the queue is generic over
// any contract call; the caller builds correctly-typed arg objects upstream.
export type ChunkArgs = Record<string, unknown>;

export type QueueChunk = {
  args: ChunkArgs;
};

export type QueueState = {
  councilId: string;
  chunks: QueueChunk[];
  completedCount: number;
  // Opaque per-operation payload the queue persists verbatim alongside the
  // chunks. The queue never reads it; callers hydrate it (post-remount) to run
  // deferred offchain cleanup tied to the onchain queue's outcome (e.g. dropping
  // DB classification rows once a removal completes, or rolling back DB inserts
  // for a discarded add). Persisting it here is what lets that cleanup survive a
  // navigation/remount instead of dying with a component-local ref.
  meta?: unknown;
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

export function serializeQueue(state: QueueState): string {
  return JSON.stringify(state, (_key, value) =>
    typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value,
  );
}

export function deserializeQueue(raw: string): QueueState | null {
  try {
    const parsed = JSON.parse(raw, (_key, value) => {
      // Only the serializer's exact { __bigint__: "<int>" } shape, so a crafted
      // lookalike object isn't silently coerced into a BigInt.
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const keys = Object.keys(value);
        const tag = (value as Record<string, unknown>)[BIGINT_TAG];

        if (
          keys.length === 1 &&
          keys[0] === BIGINT_TAG &&
          typeof tag === "string" &&
          /^-?\d+$/.test(tag)
        ) {
          return BigInt(tag);
        }
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

    // Every chunk must carry an `args` object; a corrupted/tampered entry that
    // passed JSON.parse is rejected here rather than blowing up at writeContract.
    const chunksValid = parsed.chunks.every(
      (chunk) =>
        chunk !== null &&
        typeof chunk === "object" &&
        typeof (chunk as QueueChunk).args === "object" &&
        (chunk as QueueChunk).args !== null,
    );

    if (!chunksValid) {
      return null;
    }

    return {
      councilId: parsed.councilId,
      chunks: parsed.chunks as QueueChunk[],
      completedCount: parsed.completedCount,
      meta: parsed.meta,
    };
  } catch {
    return null;
  }
}
