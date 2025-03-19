"use client";

import { useEffect } from "react";
import { http } from "viem";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { base, optimism, optimismSepolia /* arbitrum */ } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { DonorParamsContextProvider } from "@/context/DonorParams";
import { WALLET_CONNECT_PROJECT_ID } from "../lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const config = getDefaultConfig({
  appName: "Flow State",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [base, optimism, optimismSepolia /* arbitrum */],
  ssr: true,
  transports: {
    [base.id]: http("https://base-rpc.publicnode.com"),
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
    [optimismSepolia.id]: http("https://optimism-sepolia-rpc.publicnode.com"),
    /*
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
     */
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();

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
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <PostHogProvider client={posthog}>
            <DonorParamsContextProvider>{children}</DonorParamsContextProvider>
          </PostHogProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
