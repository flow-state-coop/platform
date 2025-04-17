import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const SUPERFLUID_QUERY = gql`
  query GDAPoolQuery($gdaPool: String) {
    pool(id: $gdaPool) {
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      poolMembers {
        account {
          id
        }
        units
        updatedAtTimestamp
        totalAmountReceivedUntilUpdatedAt
      }
      poolDistributors {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
    }
  }
`;

export default function useGdaPoolQuery(
  network: Network,
  gdaPoolAddress?: string,
) {
  const { data: superfluidQueryRes } = useQuery(SUPERFLUID_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      gdaPool: gdaPoolAddress,
    },
    skip: !gdaPoolAddress,
    pollInterval: 10000,
  });

  return superfluidQueryRes?.pool;
}
