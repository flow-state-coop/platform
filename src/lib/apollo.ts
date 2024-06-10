import {
  ApolloClient,
  ApolloClientOptions,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
} from "@apollo/client";
import { networks } from "@/lib/networks";

type ApiType = "streamingfund" | "superfluid";

const apolloClient: ApolloClientOptions<NormalizedCacheObject> = {
  cache: new InMemoryCache(),
  defaultOptions: {
    query: {
      errorPolicy: "all",
    },
    watchQuery: {
      errorPolicy: "all",
    },
  },
};

const streamingFundClient = new ApolloClient(apolloClient);
const superfluidClient = new ApolloClient(apolloClient);

export const getApolloClient = (type: ApiType, chainId?: number) => {
  streamingFundClient.setLink(
    new HttpLink({ uri: "https://api.streaming.fund/graphql" }),
  );

  if (chainId) {
    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      throw Error("Network not found");
    }

    superfluidClient.setLink(new HttpLink({ uri: network.superfluidSubgraph }));
  }

  const client =
    type === "streamingfund" ? streamingFundClient : superfluidClient;

  return client;
};
