import {
  ApolloClient,
  ApolloClientOptions,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
} from "@apollo/client";
import { networks } from "@/lib/networks";

type ApiType = "flowState" | "flowSplitter" | "flowCouncil" | "superfluid";

const apolloClient: ApolloClientOptions<NormalizedCacheObject> = {
  cache: new InMemoryCache({
    typePolicies: {
      Council: {
        fields: {
          councilMembers: {
            keyArgs: false,
            merge(existing = [], incoming) {
              return [...existing, ...incoming];
            },
          },
        },
      },
    },
  }),
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

const clientsByTypeAndChain = new Map<
  string,
  ApolloClient<NormalizedCacheObject>
>();

function getOrCreateClient(key: string, uri: string) {
  let client = clientsByTypeAndChain.get(key);

  if (!client) {
    client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new HttpLink({ uri }),
      defaultOptions: apolloClient.defaultOptions,
    });
    clientsByTypeAndChain.set(key, client);
  }

  return client;
}

export const getApolloClient = (type: ApiType, chainId?: number) => {
  if (type === "flowState") {
    flowStateClient.setLink(
      new HttpLink({ uri: "https://api.flowstate.network/graphql" }),
    );

    return flowStateClient;
  }

  const network = networks.find((network) => network.id === chainId);

  if (!network) return getOrCreateClient("fallback", "");

  const subgraphMap: Record<string, string | undefined> = {
    flowSplitter: network.flowSplitterSubgraph,
    flowCouncil: network.flowCouncilSubgraph,
    superfluid: network.superfluidSubgraph,
  };

  const uri = subgraphMap[type];

  if (!uri) return getOrCreateClient("fallback", "");

  return getOrCreateClient(`${type}-${chainId}`, uri);
};
