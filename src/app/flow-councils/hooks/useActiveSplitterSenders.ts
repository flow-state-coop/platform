import { useQuery, gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";

const ACTIVE_SPLITTER_SENDERS_QUERY = gql`
  query ActiveSplitterSenders($splitter: ID!, $token: String!) {
    account(id: $splitter) {
      inflows(
        where: { currentFlowRate_gt: "0", token: $token }
        first: 1000
      ) {
        sender {
          id
        }
      }
    }
    _meta {
      block {
        number
      }
    }
  }
`;

export type ActiveSplitterSenders = {
  senders: string[];
  blockNumber: number | null;
  loading: boolean;
};

export default function useActiveSplitterSenders({
  splitterAddress,
  tokenAddress,
  chainId,
  enabled = true,
}: {
  splitterAddress: string | null | undefined;
  tokenAddress: string | null | undefined;
  chainId: number;
  enabled?: boolean;
}): ActiveSplitterSenders {
  const skip = !enabled || !splitterAddress || !tokenAddress;
  const { data, loading } = useQuery(ACTIVE_SPLITTER_SENDERS_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      splitter: splitterAddress?.toLowerCase(),
      token: tokenAddress?.toLowerCase(),
    },
    skip,
  });

  const senders: string[] =
    data?.account?.inflows?.map(
      (i: { sender: { id: string } }) => i.sender.id,
    ) ?? [];
  const blockNumber: number | null = data?._meta?.block?.number ?? null;

  return { senders, blockNumber, loading };
}
