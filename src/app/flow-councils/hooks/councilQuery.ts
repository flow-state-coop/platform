import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const COUNCIL_QUERY = gql`
  query CouncilQuery($councilId: String) {
    council(id: $councilId) {
      id
      pool
      metadata
      grantees {
        metadata
        account
        votes(first: 1000, orderBy: createdAtTimestamp, orderDirection: desc) {
          votedBy
          amount
          createdAtTimestamp
        }
      }
      distributionToken
      maxAllocationsPerMember
    }
  }
`;

export default function useCouncilQuery(network: Network, councilId: string) {
  const { data: councilQueryRes } = useQuery(COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
    },
    pollInterval: 2000,
    skip: !councilId,
  });

  return councilQueryRes?.council;
}
