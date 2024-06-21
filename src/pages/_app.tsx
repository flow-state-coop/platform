import type { AppProps } from "next/app";
import { http } from "viem";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { optimismSepolia, base } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { AdminParamsContextProvider } from "@/context/AdminParams";
import { WALLET_CONNECT_PROJECT_ID } from "../lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const config = getDefaultConfig({
  appName: "SQF Admin",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [optimismSepolia, base],
  ssr: true,
  transports: {
    [optimismSepolia.id]: http("https://optimism-sepolia-rpc.publicnode.com"),
    [base.id]: http("https://mainnet.base.org/"),
  },
});

export default function App({ Component, pageProps }: AppProps) {
  const queryClient = new QueryClient();

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <AdminParamsContextProvider>
            <Layout>
              <Component {...pageProps} />
            </Layout>
          </AdminParamsContextProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
