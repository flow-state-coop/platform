import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { useEnsResolution } from "@/hooks/useEnsResolution";

export function useProfileDisplayName(): {
  displayName: string | null;
  isLoading: boolean;
} {
  const { address } = useAccount();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const addresses = useMemo(() => (address ? [address] : []), [address]);
  const { ensByAddress, isLoading: ensLoading } = useEnsResolution(addresses);
  const ensName = address
    ? (ensByAddress?.[address.toLowerCase()]?.name ?? null)
    : null;

  useEffect(() => {
    if (!address) {
      setProfileName(null);
      setProfileLoaded(true);
      return;
    }

    setProfileLoaded(false);
    const controller = new AbortController();

    fetch(`/api/flow-council/profile?address=${encodeURIComponent(address)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        setProfileName(
          data.success && data.profile ? data.profile.displayName : null,
        );
        setProfileLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProfileName(null);
          setProfileLoaded(true);
        }
      });

    return () => controller.abort();
  }, [address]);

  return {
    displayName: profileName ?? (profileLoaded ? ensName : null),
    isLoading: !profileLoaded || ensLoading,
  };
}
