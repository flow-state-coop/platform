import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String) {
    flowCouncil(id: $councilId) {
      id
      distributionPool
      recipients {
        account
      }
      superToken
      maxVotingSpread
    }
  }
`;

export default function useCouncilQuery(
  network: Network,
  councilId: string,
  enabled = true,
) {
  const { data: councilQueryRes } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
    },
    pollInterval: 15000,
    skip: !councilId || !enabled,
  });

  return councilQueryRes?.flowCouncil;
}
