import type { AppProps } from "next/app";
import { http } from "viem";
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { optimismSepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { AdminParamsContextProvider } from "@/context/AdminParams";
import { WALLET_CONNECT_PROJECT_ID } from "../lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const config = getDefaultConfig({
  appName: "SQF Admin",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [optimismSepolia],
  ssr: true,
  transports: {
    [optimismSepolia.id]: http("https://optimism-sepolia-rpc.publicnode.com"),
  },
});

const apolloClient = new ApolloClient({
  uri: "https://api.streaming.fund/graphql",
  cache: new InMemoryCache(),
});

export default function App({ Component, pageProps }: AppProps) {
  const queryClient = new QueryClient();

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <ApolloProvider client={apolloClient}>
            <AdminParamsContextProvider>
              <Layout>
                <Component {...pageProps} />
              </Layout>
            </AdminParamsContextProvider>
          </ApolloProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
