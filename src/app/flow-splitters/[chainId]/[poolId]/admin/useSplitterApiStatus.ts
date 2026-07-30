"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Whether the pool is API-controlled, readable without signing in.
 *
 * Undefined until it resolves and if it fails, so the caller can avoid
 * promising a pool is not API-controlled when it simply could not tell.
 * `statusError` separates the two, because a read that has failed is not
 * loading and the page has to say so rather than wait forever.
 */
export function useSplitterApiStatus(chainId: number, poolId: string) {
  const [hasActiveKeys, setHasActiveKeys] = useState<boolean | undefined>(
    undefined,
  );
  const [statusError, setStatusError] = useState(false);
  // Only the newest request may write state: minting a key reloads this while a
  // pool switch can have one in flight, and the older response landing last
  // would answer for the pool that is no longer on screen.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;

    try {
      const res = await fetch(
        `/api/flow-splitter/status?chainId=${chainId}&poolId=${poolId}`,
      );
      const data = await res.json();

      if (id !== requestId.current) {
        return;
      }

      if (!data.success) {
        throw new Error(data.error ?? "Couldn't read the pool's API status");
      }

      setHasActiveKeys(data.hasActiveKeys);
      setStatusError(false);
    } catch (err) {
      console.error(err);

      if (id === requestId.current) {
        setStatusError(true);
      }
    }
  }, [chainId, poolId]);

  // `load` is memoized on the pool, so this fires on a pool switch and never on
  // the reloads that follow a mint, where dropping back to "unknown" would
  // flicker the notice the caller just changed.
  useEffect(() => {
    setHasActiveKeys(undefined);
    setStatusError(false);
    load();
  }, [load]);

  return { hasActiveKeys, statusError, reload: load };
}
