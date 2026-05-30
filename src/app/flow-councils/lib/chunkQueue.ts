// Chunking helpers for batched onchain operations (Voter Groups bulk actions).
// Kept framework-free and side-effect free so it can be unit tested and so the
// queue hook (useChunkedTxQueue) has a single import site for the chunk size.

// Spec / impl-plan: "CHUNK_SIZE = 50" (conservative Celo gas estimate, ~50 voters per updateVoters call)
export const CHUNK_SIZE = 50;

/**
 * Split `items` into consecutive chunks of at most `size`, preserving order and
 * item identity. The final chunk holds the remainder. An empty input returns
 * an empty array; a `size` >= length returns a single chunk.
 *
 * Throws on a non-positive `size` — chunking by 0 (or negative) is a caller
 * error and silently coercing it would mask the bug while risking an infinite
 * loop in naive implementations.
 *
 * Does not mutate `items`.
 */
export function splitIntoChunks<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error(
      `splitIntoChunks: size must be a positive integer, got ${size}`,
    );
  }

  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}
