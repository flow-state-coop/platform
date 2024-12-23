import {
  ApolloClient,
  ApolloClientOptions,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
} from "@apollo/client";
import { networks } from "@/lib/networks";

type ApiType = "flowState" | "flowSplitter" | "superfluid";

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

const flowStateClient = new ApolloClient(apolloClient);
const flowSplitterClient = new ApolloClient(apolloClient);
const superfluidClient = new ApolloClient(apolloClient);

export const getApolloClient = (type: ApiType, chainId?: number) => {
  if (type === "flowState") {
    flowStateClient.setLink(
      new HttpLink({ uri: "https://api.flowstate.network/graphql" }),
    );

    return flowStateClient;
  } else if (type === "flowSplitter") {
    const network = networks.find((network) => network.id === chainId);

    if (network) {
      flowSplitterClient.setLink(
        new HttpLink({ uri: network.flowSplitterSubgraph }),
      );
    }

    return flowSplitterClient;
  } else if (type === "superfluid") {
    const network = networks.find((network) => network.id === chainId);

    if (network) {
      superfluidClient.setLink(
        new HttpLink({ uri: network.superfluidSubgraph }),
      );
    }

    return superfluidClient;
  }
};
