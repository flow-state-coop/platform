"use client";

import { useState, useEffect, useCallback } from "react";

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

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/flow-splitter/status?chainId=${chainId}&poolId=${poolId}`,
      );
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error ?? "Couldn't read the pool's API status");
      }

      setHasActiveKeys(data.hasActiveKeys);
      setStatusError(false);
    } catch (err) {
      console.error(err);
      setStatusError(true);
    }
  }, [chainId, poolId]);

  useEffect(() => {
    load();
  }, [load]);

  return { hasActiveKeys, statusError, reload: load };
}
