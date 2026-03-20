"use client";

import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { http } from "viem";
import {
  connectorsForWallets,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  walletConnectWallet,
  injectedWallet,
  baseAccount,
  safeWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, WagmiProvider } from "wagmi";
import { arbitrum, base, celo, optimism, optimismSepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { DonorParamsContextProvider } from "@/context/DonorParams";
import { FlowCouncilContextProvider } from "@/context/FlowCouncil";
import { networks } from "@/lib/networks";
import { WALLET_CONNECT_PROJECT_ID, DEFAULT_CHAIN_ID } from "@/lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const chains = [arbitrum, base, celo, optimism, optimismSepolia] as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        walletConnectWallet,
        injectedWallet,
        baseAccount,
        safeWallet,
        rainbowWallet,
      ],
    },
  ],
  { appName: "Flow State", projectId: WALLET_CONNECT_PROJECT_ID },
);

const config = createConfig({
  connectors,
  chains,
  ssr: true,
  transports: {
    [arbitrum.id]: http(
      networks.find((network) => network.id === arbitrum.id)!.rpcUrl,
    ),
    [base.id]: http(networks.find((network) => network.id === base.id)!.rpcUrl),
    [celo.id]: http(networks.find((network) => network.id === celo.id)!.rpcUrl),
    [optimism.id]: http(
      networks.find((network) => network.id === optimism.id)!.rpcUrl,
    ),
    [optimismSepolia.id]: http(
      networks.find((network) => network.id === optimismSepolia.id)!.rpcUrl,
    ),
  },
});

const queryClient = new QueryClient();

const CELO_CHAIN_ID = 42220;

function useInitialChain() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const searchChainId = searchParams.get("chainId");

    if (
      (segments[0] === "flow-councils" || segments[0] === "flow-splitters") &&
      segments[1] === "launch" &&
      segments[2]
    ) {
      return Number(segments[2]);
    }

    if (
      (segments[0] === "flow-councils" || segments[0] === "flow-splitters") &&
      segments[1] &&
      segments[1] !== "launch" &&
      !isNaN(Number(segments[1]))
    ) {
      return Number(segments[1]);
    }

    if (searchChainId) {
      return Number(searchChainId);
    }

    if (
      segments[0] === "flow-councils" ||
      (segments[0] === "flow-councils" && segments[1] === "launch")
    ) {
      return CELO_CHAIN_ID;
    }

    return DEFAULT_CHAIN_ID;
  }, [pathname, searchParams]);
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const initialChain = useInitialChain();

  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: "identified_only",
      persistence: "memory",
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      session_recording: {
        maskTextSelector: ".sensitive",
      },
    });
  }, []);

  return (
    <Suspense>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <RainbowKitProvider modalSize="compact" initialChain={initialChain}>
              <PostHogProvider client={posthog}>
                <DonorParamsContextProvider>
                  <FlowCouncilContextProvider>
                    {children}
                  </FlowCouncilContextProvider>
                </DonorParamsContextProvider>
              </PostHogProvider>
            </RainbowKitProvider>
          </SessionProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </Suspense>
  );
}
