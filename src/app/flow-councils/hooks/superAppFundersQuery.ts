import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

export type SuperAppFunderData = {
  totalInflowRate: string;
  totalAmountStreamedInUntilUpdatedAt: string;
  updatedAtTimestamp: number;
  funderCount: number;
};

const SUPER_APP_FUNDERS_QUERY = gql`
  query SuperAppFundersQuery($superApp: ID!, $token: String!) {
    account(id: $superApp) {
      accountTokenSnapshots(where: { token: $token }) {
        totalInflowRate
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
      }
      inflows(where: { currentFlowRate_gt: "0", token: $token }) {
        id
      }
    }
  }
`;

export default function useSuperAppFundersQuery(
  network: Network,
  superAppAddress?: string | null,
  tokenAddress?: string,
): SuperAppFunderData | undefined {
  const { data } = useQuery(SUPER_APP_FUNDERS_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      superApp: superAppAddress?.toLowerCase(),
      token: tokenAddress?.toLowerCase(),
    },
    skip: !superAppAddress || !tokenAddress,
    pollInterval: 10000,
  });

  const account = data?.account;

  if (!account) {
    return undefined;
  }

  const snapshot = account.accountTokenSnapshots?.[0];

  if (!snapshot) {
    return undefined;
  }

  return {
    totalInflowRate: snapshot.totalInflowRate,
    totalAmountStreamedInUntilUpdatedAt:
      snapshot.totalAmountStreamedInUntilUpdatedAt,
    updatedAtTimestamp: Number(snapshot.updatedAtTimestamp),
    funderCount: account.inflows?.length ?? 0,
  };
}
