import { useState, useEffect, useCallback } from "react";
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

export function useEnsResolution(addresses: string[]): {
  ensByAddress: EnsByAddress | null;
  isLoading: boolean;
} {
  const [ensByAddress, setEnsByAddress] = useState<EnsByAddress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Create a stable key for the addresses array
  const addressesKey = addresses.join(",").toLowerCase();

  const resolveAddresses = useCallback(async () => {
    if (!addresses || addresses.length === 0) {
      setEnsByAddress({});
      return;
    }

    // Deduplicate addresses
    const uniqueAddresses = [...new Set(addresses.map((a) => a.toLowerCase()))];

    setIsLoading(true);

    const result: EnsByAddress = {};

    try {
      const ensNames = await Promise.all(
        uniqueAddresses.map((address) =>
          publicClient
            .getEnsName({
              address: address as Address,
            })
            .catch(() => null),
        ),
      );

      const ensAvatars = await Promise.all(
        ensNames.map((ensName) => {
          if (!ensName) return Promise.resolve(null);
          return publicClient
            .getEnsAvatar({
              name: normalize(ensName),
              gatewayUrls: ["https://ccip.ens.xyz"],
              assetGatewayUrls: {
                ipfs: IPFS_GATEWAYS[0],
              },
            })
            .catch(() => null);
        }),
      );

      for (let i = 0; i < uniqueAddresses.length; i++) {
        result[uniqueAddresses[i]] = {
          name: ensNames[i] ?? null,
          avatar: ensAvatars[i] ?? null,
        };
      }
    } catch (err) {
      console.error("Error resolving ENS:", err);
      // Populate with null values on error
      for (const address of uniqueAddresses) {
        result[address] = { name: null, avatar: null };
      }
    }

    setEnsByAddress(result);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey]);

  useEffect(() => {
    resolveAddresses();
  }, [resolveAddresses]);

  return { ensByAddress, isLoading };
}
