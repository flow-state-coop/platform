import { useState, useEffect } from "react";
import { Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { IPFS_GATEWAYS } from "@/lib/constants";

export type EnsData = {
  name: string | null;
  avatar: string | null;
};

export type EnsByAddress = {
  [address: string]: EnsData;
};

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com", {
    batch: {
      batchSize: 100,
      wait: 10,
    },
  }),
});

// Session-wide caches so re-resolving the same addresses (e.g. paging a table
// back and forth) never refetches. Failed lookups are left uncached so a
// transient RPC error is retried on the next resolution. Capped with
// oldest-first eviction so a session that walks a huge roster can't grow
// them without bound.
const MAX_CACHE_ENTRIES = 10_000;
const nameCache = new Map<string, string | null>();
const avatarCache = new Map<string, string | null>();

function cacheSet(
  cache: Map<string, string | null>,
  key: string,
  value: string | null,
) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value!);
  }

  cache.set(key, value);
}

export function useEnsResolution(
  addresses: string[],
  options?: { avatars?: boolean },
): {
  ensByAddress: EnsByAddress | null;
  isLoading: boolean;
} {
  const [ensByAddress, setEnsByAddress] = useState<EnsByAddress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const withAvatars = options?.avatars !== false;

  // Create a stable key for the addresses array
  const addressesKey = addresses.join(",").toLowerCase();

  useEffect(() => {
    if (addressesKey === "") {
      setEnsByAddress({});
      setIsLoading(false);
      return;
    }

    const uniqueAddresses = [...new Set(addressesKey.split(","))];

    let cancelled = false;

    const resolve = async () => {
      const uncachedNames = uniqueAddresses.filter(
        (address) => !nameCache.has(address),
      );

      if (uncachedNames.length > 0) {
        setIsLoading(true);
      }

      const nameResults = await Promise.all(
        uncachedNames.map(async (address) => {
          try {
            const name = await publicClient.getEnsName({
              address: address as Address,
            });

            return { address, name, ok: true };
          } catch {
            return { address, name: null, ok: false };
          }
        }),
      );

      for (const { address, name, ok } of nameResults) {
        if (ok) {
          cacheSet(nameCache, address, name);
        }
      }

      if (withAvatars) {
        const uncachedAvatars = uniqueAddresses.filter(
          (address) =>
            nameCache.get(address) != null && !avatarCache.has(address),
        );

        const avatarResults = await Promise.all(
          uncachedAvatars.map(async (address) => {
            try {
              const avatar = await publicClient.getEnsAvatar({
                name: normalize(nameCache.get(address)!),
                gatewayUrls: ["https://ccip.ens.xyz"],
                assetGatewayUrls: {
                  ipfs: IPFS_GATEWAYS[0],
                },
              });

              return { address, avatar, ok: true };
            } catch {
              return { address, avatar: null, ok: false };
            }
          }),
        );

        for (const { address, avatar, ok } of avatarResults) {
          if (ok) {
            cacheSet(avatarCache, address, avatar);
          }
        }
      }

      // A newer resolution for a different address set has taken over this
      // hook's state; writing now would show the wrong page's names.
      if (cancelled) {
        return;
      }

      const result: EnsByAddress = {};

      for (const address of uniqueAddresses) {
        result[address] = {
          name: nameCache.get(address) ?? null,
          avatar: withAvatars ? (avatarCache.get(address) ?? null) : null,
        };
      }

      setEnsByAddress(result);
      setIsLoading(false);
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [addressesKey, withAvatars]);

  return { ensByAddress, isLoading };
}
