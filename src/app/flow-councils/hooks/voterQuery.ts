import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const VOTER_QUERY = gql`
  query VoterQuery($flowCouncilId: String, $address: String) {
    flowCouncil(id: $flowCouncilId) {
      voters(where: { account: $address }) {
        account
        votingPower
      }
    }
  }
`;

export default function useVoterQuery(
  network: Network,
  flowCouncilId: string,
  address: string,
) {
  const { data: flowCouncilQueryRes } = useQuery(VOTER_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      flowCouncilId: flowCouncilId?.toLowerCase(),
      address: address.toLowerCase(),
    },
    pollInterval: 4000,
    skip: !flowCouncilId || !address,
  });

  const voter = flowCouncilQueryRes?.flowCouncil?.voters?.[0];

  return voter;
}
