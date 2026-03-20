import {
  ApolloClient,
  DefaultOptions,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
  TypePolicies,
} from "@apollo/client";
import { networks } from "@/lib/networks";

type ApiType = "flowState" | "flowSplitter" | "flowCouncil" | "superfluid";

const defaultOptions: DefaultOptions = {
  query: {
    errorPolicy: "all",
  },
  watchQuery: {
    errorPolicy: "all",
  },
};

const flowCouncilTypePolicies: TypePolicies = {
  FlowCouncil: {
    fields: {
      voters: {
        keyArgs: false,
        merge(existing = [], incoming: unknown[]) {
          return [...existing, ...incoming];
        },
      },
    },
  },
};

const clientsByTypeAndChain = new Map<
  string,
  ApolloClient<NormalizedCacheObject>
>();

function getOrCreateClient(
  key: string,
  uri: string,
  typePolicies?: TypePolicies,
) {
  let client = clientsByTypeAndChain.get(key);

  if (!client) {
    client = new ApolloClient({
      cache: new InMemoryCache({ typePolicies }),
      link: new HttpLink({ uri }),
      defaultOptions,
    });
    clientsByTypeAndChain.set(key, client);
  }

  return client;
}

export const getApolloClient = (type: ApiType, chainId?: number) => {
  if (type === "flowState") {
    return getOrCreateClient(
      "flowState",
      "https://api.flowstate.network/graphql",
    );
  }

  const network = networks.find((network) => network.id === chainId);

  if (!network) {
    throw new Error(`No network configured for chainId ${chainId}`);
  }

  const subgraphMap: Record<string, string | undefined> = {
    flowSplitter: network.flowSplitterSubgraph,
    flowCouncil: network.flowCouncilSubgraph,
    superfluid: network.superfluidSubgraph,
  };

  const uri = subgraphMap[type];

  if (!uri) {
    throw new Error(`No subgraph URI for type "${type}" on chain ${chainId}`);
  }

  return getOrCreateClient(
    `${type}-${chainId}`,
    uri,
    type === "flowCouncil" ? flowCouncilTypePolicies : undefined,
  );
};
