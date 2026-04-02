import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useEnsResolution } from "@/hooks/useEnsResolution";

export function useProfileDisplayName(): {
  displayName: string | null;
  isLoading: boolean;
} {
  const { address } = useAccount();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const addresses = address ? [address] : [];
  const { ensByAddress, isLoading: ensLoading } = useEnsResolution(addresses);
  const ensName = address
    ? (ensByAddress?.[address.toLowerCase()]?.name ?? null)
    : null;

  const fetchDisplayName = useCallback(async () => {
    if (!address) {
      setProfileName(null);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`/api/flow-council/profile?address=${address}`);
      const data = await res.json();

      setProfileName(
        data.success && data.profile ? data.profile.displayName : null,
      );
    } catch {
      setProfileName(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchDisplayName();
  }, [fetchDisplayName]);

  return {
    displayName: profileName ?? ensName,
    isLoading: isLoading || ensLoading,
  };
}
