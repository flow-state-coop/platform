"use client";

import { useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import {
  createWalletClient,
  custom,
  EIP1193Provider,
  PublicClient,
} from "viem";
import { IdentitySDK, SupportedChains } from "@goodsdks/citizen-sdk";
import { resolveVerifiedRoot } from "@/app/flow-councils/lib/goodDollarIdentity";

export function useGoodDollarVerification() {
  const { address, connector } = useAccount();
  const celoPublicClient = usePublicClient({ chainId: celo.id });

  // The identity SDK only accepts wallet clients on GoodDollar chains, so the
  // client is pinned to Celo over the connected wallet's transport. Signing the
  // face verification message is chain-agnostic, no network switch needed.
  const generateFVLink = useCallback(
    async (popupMode: boolean, callbackUrl: string): Promise<string> => {
      if (!address || !connector || !celoPublicClient) {
        throw new Error("Wallet not connected");
      }

      const provider = (await connector.getProvider()) as EIP1193Provider;
      const celoWalletClient = createWalletClient({
        account: address,
        chain: celo,
        transport: custom(provider),
      });
      const identitySDK = new IdentitySDK({
        account: address,
        publicClient: celoPublicClient as PublicClient,
        walletClient: celoWalletClient,
        env: "production",
      });

      return identitySDK.generateFVLink(
        popupMode,
        callbackUrl,
        SupportedChains.CELO,
      );
    },
    [address, connector, celoPublicClient],
  );

  // Advisory only, and resolved the same way the eligibility route resolves it
  // so a wallet connected to a verified identity is never sent back through
  // face verification it has already passed.
  const checkIsWhitelisted = useCallback(async (): Promise<boolean> => {
    if (!address || !celoPublicClient) {
      return false;
    }

    const root = await resolveVerifiedRoot(
      celoPublicClient as PublicClient,
      address,
    );

    return root !== null;
  }, [address, celoPublicClient]);

  return { generateFVLink, checkIsWhitelisted };
}
