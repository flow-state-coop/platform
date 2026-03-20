import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const VOTER_QUERY = gql`
  query VoterQuery($voterId: String) {
    voter(id: $voterId) {
      id
      account
      votingPower
    }
  }
`;

export default function useCouncilMemberQuery(
  network: Network,
  councilId: string,
  address: string,
  enabled = true,
) {
  const voterId = `${councilId?.toLowerCase()}-${address?.toLowerCase()}`;

  const { data: voterQueryRes } = useQuery(VOTER_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: { voterId },
    pollInterval: 15000,
    skip: !councilId || !address || !enabled,
  });

  const voter = voterQueryRes?.voter;

  if (voter && voter.id !== voterId) return undefined;

  return voter && Number(voter.votingPower) > 0 ? voter : undefined;
}
