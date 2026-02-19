"use client";

import { Suspense, useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { http } from "viem";
import {
  connectorsForWallets,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  walletConnectWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, WagmiProvider } from "wagmi";
import {
  mainnet,
  arbitrum,
  base,
  celo,
  optimism,
  optimismSepolia,
} from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { DonorParamsContextProvider } from "@/context/DonorParams";
import { FlowCouncilContextProvider } from "@/context/FlowCouncil";
import { networks } from "@/lib/networks";
import { WALLET_CONNECT_PROJECT_ID } from "@/lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const chains = [mainnet, arbitrum, base, celo, optimism, optimismSepolia] as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        walletConnectWallet,
        injectedWallet,
        metaMaskWallet,
        rabbyWallet,
        coinbaseWallet,
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
    [mainnet.id]: http("https://mainnet.infura.io"),
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

export default function Providers({ children }: { children: React.ReactNode }) {
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
            <RainbowKitProvider modalSize="compact">
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
