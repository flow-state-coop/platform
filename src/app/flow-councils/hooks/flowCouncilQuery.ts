import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($flowCouncilId: String) {
    flowCouncil(id: $flowCouncilId) {
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

export default function useFlowCouncilQuery(
  network: Network,
  flowCouncilId: string,
) {
  const { data: flowCouncilQueryRes } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      flowCouncilId: flowCouncilId?.toLowerCase(),
    },
    pollInterval: 4000,
    skip: !flowCouncilId,
  });

  return flowCouncilQueryRes?.flowCouncil;
}
