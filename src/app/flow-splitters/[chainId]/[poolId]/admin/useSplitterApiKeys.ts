"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type SplitterApiKey = {
  id: number;
  label: string;
  keyPrefix: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/**
 * Lives on the admin page rather than inside the keys panel because the
 * destructive-action warnings need the active count too, and a second copy of
 * this fetch would let the two disagree.
 */
export function useSplitterApiKeys(
  chainId: number,
  poolId: string,
  enabled: boolean,
) {
  const [keys, setKeys] = useState<SplitterApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Only the newest request may write state: sign-in and the Apollo poll can
  // both flip `enabled`, and two responses landing out of order would otherwise
  // leave the older one's list on screen.
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;

    // Listing requires a signed-in pool admin, so anyone else would only get a
    // 401/403; skip the request and leave the panel showing the endpoint alone.
    if (!enabled) {
      setKeys([]);
      setLoadError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch(
        `/api/flow-splitter/keys?chainId=${chainId}&poolId=${poolId}`,
      );
      const data = await res.json();

      if (id !== requestId.current) {
        return;
      }

      if (!data.success) {
        setKeys([]);
        setLoadError(data.error ?? "Failed to load API keys");
        return;
      }

      setKeys(data.keys);
    } catch {
      if (id !== requestId.current) {
        return;
      }

      setKeys([]);
      setLoadError("Failed to load API keys");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [chainId, poolId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { keys, loading, loadError, reload };
}
