type Window = { count: number; resetAt: number };

const namespaces = new Map<string, Map<string, Window>>();

// Bounded so an enumerating caller cannot grow a map without limit. Eviction is
// least-recently-started, which needs no sorting: a Map iterates in insertion
// order, and every new window re-inserts its key at the tail.
//
// The budget is per namespace, not shared. Every identifier these limits are
// keyed on is self-serve (a SIWE session, a client IP), so one namespace under
// a flood would otherwise evict the windows protecting a different surface, and
// the cheapest namespace to enumerate would decide the limits everywhere.
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
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();

  let windows = namespaces.get(namespace);
  if (!windows) {
    windows = new Map<string, Window>();
    namespaces.set(namespace, windows);
  }

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

/**
 * The caller, for the limits that have no credential to key on.
 *
 * Read from the headers the platform sets itself. The leftmost entry of
 * x-forwarded-for is whatever the caller sent, so keying on it hands out a fresh
 * window per request and fills the map with junk. Behind a proxy that sets
 * neither, every caller shares one window and the limit stops being per-caller.
 */
export function clientIdentifier(
  headers: Headers | Record<string, unknown> | undefined,
): string {
  const read = (name: string): string => {
    const value =
      headers instanceof Headers ? headers.get(name) : headers?.[name];

    return typeof value === "string" ? value.trim() : "";
  };

  return read("x-vercel-forwarded-for") || read("x-real-ip") || "unknown";
}

/** Test seam: windows are process-wide and would carry between cases. */
export function resetRateLimits() {
  namespaces.clear();
}
