import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String) {
    flowCouncil(id: $councilId) {
      id
      distributionPool
      metadata
      recipients {
        metadata
        account
        votes(first: 1000, orderBy: createdAtTimestamp, orderDirection: desc) {
          votedBy
          amount
          createdAtTimestamp
        }
      }
      superToken
      maxVotingSpread
    }
  }
`;

export default function useCouncilQuery(network: Network, councilId: string) {
  const { data: councilQueryRes } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
    },
    pollInterval: 4000,
    skip: !councilId,
  });

  return councilQueryRes?.flowCouncil;
}
