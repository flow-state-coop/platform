import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";

export function useProfileDisplayName(): {
  displayName: string | null;
  isLoading: boolean;
} {
  const { address } = useAccount();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDisplayName = useCallback(async () => {
    if (!address) {
      setDisplayName(null);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`/api/flow-council/profile?address=${address}`);
      const data = await res.json();

      setDisplayName(
        data.success && data.profile ? data.profile.displayName : null,
      );
    } catch {
      setDisplayName(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchDisplayName();
  }, [fetchDisplayName]);

  return { displayName, isLoading };
}
