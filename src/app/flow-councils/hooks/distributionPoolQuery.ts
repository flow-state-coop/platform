import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const SUPERFLUID_QUERY = gql`
  query DistributionPoolQuery($distributionPool: String) {
    pool(id: $distributionPool) {
      id
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      poolMembers(first: 1000) {
        account {
          id
        }
        units
        updatedAtTimestamp
        totalAmountReceivedUntilUpdatedAt
        isConnected
      }
      poolDistributors(first: 1000) {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
      token {
        id
        symbol
      }
    }
  }
`;

export default function useDistributionPoolQuery(
  network: Network,
  distributionPoolAddress?: string,
) {
  const { data: superfluidQueryRes } = useQuery(SUPERFLUID_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      distributionPool: distributionPoolAddress?.toLowerCase(),
    },
    skip: !distributionPoolAddress,
    pollInterval: 10000,
  });

  return superfluidQueryRes?.pool;
}
