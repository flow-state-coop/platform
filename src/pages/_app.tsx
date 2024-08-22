import type { AppProps } from "next/app";
import { http } from "viem";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { optimism, base, arbitrum, optimismSepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { AdminParamsContextProvider } from "@/context/AdminParams";
import { DonorParamsContextProvider } from "@/context/DonorParams";
import { WALLET_CONNECT_PROJECT_ID } from "../lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const config = getDefaultConfig({
  appName: "SQF Admin",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [optimism, base, arbitrum, optimismSepolia],
  ssr: true,
  transports: {
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
    [base.id]: http("https://mainnet.base.org/"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [optimismSepolia.id]: http("https://optimism-sepolia-rpc.publicnode.com"),
  },
});

export default function App({ Component, pageProps }: AppProps) {
  const queryClient = new QueryClient();

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <AdminParamsContextProvider>
            <DonorParamsContextProvider>
              <Layout>
                <Component {...pageProps} />
              </Layout>
            </DonorParamsContextProvider>
          </AdminParamsContextProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
