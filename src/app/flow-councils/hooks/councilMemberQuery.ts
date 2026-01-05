import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const VOTER_QUERY = gql`
  query VoterQuery($councilId: String, $address: String) {
    flowCouncil(id: $councilId) {
      voters(where: { account: $address }) {
        account
        votingPower
      }
    }
  }
`;

export default function useCouncilMemberQuery(
  network: Network,
  councilId: string,
  address: string,
) {
  const { data: councilQueryRes } = useQuery(VOTER_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
      address: address.toLowerCase(),
    },
    pollInterval: 4000,
    skip: !councilId || !address,
  });

  const voter = councilQueryRes?.flowCouncil?.voters?.[0];

  return voter;
}
