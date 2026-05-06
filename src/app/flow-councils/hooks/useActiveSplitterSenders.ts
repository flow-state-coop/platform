import { useQuery, gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";

const SENDERS_PAGE_SIZE = 1000;

const ACTIVE_SPLITTER_SENDERS_QUERY = gql`
  query ActiveSplitterSenders($splitter: ID!, $token: String!, $first: Int!) {
    account(id: $splitter) {
      inflows(
        where: { currentFlowRate_gt: "0", token: $token }
        first: $first
      ) {
        sender {
          id
        }
      }
    }
  }
`;

export type ActiveSplitterSenders = {
  senders: string[];
  loading: boolean;
  truncated: boolean;
  refetch: () => Promise<unknown>;
};

export default function useActiveSplitterSenders({
  splitterAddress,
  tokenAddress,
  chainId,
  enabled,
}: {
  splitterAddress: string | null | undefined;
  tokenAddress: string | null | undefined;
  chainId: number;
  enabled: boolean;
}): ActiveSplitterSenders {
  const skip = !enabled || !splitterAddress || !tokenAddress;
  const { data, loading, refetch } = useQuery(ACTIVE_SPLITTER_SENDERS_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      splitter: splitterAddress?.toLowerCase(),
      token: tokenAddress?.toLowerCase(),
      first: SENDERS_PAGE_SIZE,
    },
    skip,
  });

  const senders: string[] =
    data?.account?.inflows?.map(
      (i: { sender: { id: string } }) => i.sender.id,
    ) ?? [];
  const truncated = senders.length === SENDERS_PAGE_SIZE;

  return { senders, loading, truncated, refetch };
}
