import { useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter, Router } from "next/router";
import { http } from "viem";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { /*optimism, arbitrum,*/ base, optimismSepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import Layout from "@/components/Layout";
import { DonorParamsContextProvider } from "@/context/DonorParams";
import { WALLET_CONNECT_PROJECT_ID } from "../lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const config = getDefaultConfig({
  appName: "Flow State",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [/*optimism, arbitrum,*/ base, optimismSepolia],
  ssr: true,
  transports: {
    /*
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
     */
    [base.id]: http("https://base-rpc.publicnode.com"),
    [optimismSepolia.id]: http("https://optimism-sepolia-rpc.publicnode.com"),
  },
});

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const queryClient = new QueryClient();

  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: "identified_only",
      persistence: "memory",
      disable_session_recording: true,
      session_recording: {
        maskTextSelector: ".sensitive",
      },
    });

    const handleRouteChange = () => posthog?.capture("$pageview");

    Router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      Router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <PostHogProvider client={posthog}>
            <DonorParamsContextProvider>
              <Layout>
                <Component key={router.asPath} {...pageProps} />
              </Layout>
            </DonorParamsContextProvider>
          </PostHogProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
