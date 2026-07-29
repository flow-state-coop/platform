type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Bounded so an enumerating caller cannot grow the map without limit. Eviction
// is least-recently-started, which needs no sorting: a Map iterates in
// insertion order, and every new window re-inserts its key at the tail.
export const MAX_TRACKED_KEYS = 10_000;

/**
 * Fixed-window request counter.
 *
 * In-memory and therefore per instance: under serverless this bounds what one
 * caller can extract from a single warm instance, not what they can extract in
 * total. That is the right shape for the thing it protects against, which is a
 * loop driving upstream work rather than a distributed flood, and it needs no
 * new infrastructure. Anything needing a real global limit wants a store.
 */
export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const current = windows.get(key);

  if (current && current.resetAt > now) {
    if (current.count >= limit) {
      return false;
    }

    current.count += 1;

    return true;
  }

  // Dropped before the size check rather than overwritten in place, so opening
  // a new window moves the key to the tail and the eviction below only fires
  // when the map is actually about to grow. Without this a caller that never
  // stops is the oldest insertion forever, so it is the first thing evicted and
  // its limit resets: the busiest callers would be the ones escaping it.
  windows.delete(key);

  if (windows.size >= MAX_TRACKED_KEYS) {
    const leastRecentlyStarted = windows.keys().next().value;

    if (leastRecentlyStarted !== undefined) {
      windows.delete(leastRecentlyStarted);
    }
  }

  windows.set(key, { count: 1, resetAt: now + windowMs });

  return true;
}

/** Test seam: windows are process-wide and would carry between cases. */
export function resetRateLimits() {
  windows.clear();
}
