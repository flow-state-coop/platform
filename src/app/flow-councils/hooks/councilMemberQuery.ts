import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const COUNCIL_MEMBER_QUERY = gql`
  query CouncilMemberQuery($councilId: String, $address: String) {
    council(id: $councilId) {
      councilMembers(where: { account: $address }) {
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
  const { data: councilQueryRes } = useQuery(COUNCIL_MEMBER_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
      address: address.toLowerCase(),
    },
    pollInterval: 10000,
    skip: !councilId || !address,
  });

  const councilMember = councilQueryRes?.council?.councilMembers?.[0];

  return councilMember;
}
