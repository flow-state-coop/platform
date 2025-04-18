import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const COUNCIL_QUERY = gql`
  query CouncilNameAndGrantees($councilId: String) {
    council(id: $councilId) {
      id
      pool
      metadata
      councilMembers {
        account
        votingPower
      }
      grantees {
        metadata
        account
      }
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
    pollInterval: 10000,
  });

  return councilQueryRes?.council;
}
