import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const ALLOCATION_QUERY = gql`
  query AllocationQuery($councilId: String, $councilMember: String) {
    councilMember(id: $councilMember) {
      votingPower
    }
    allocations(
      first: 1
      where: { council: $councilId, councilMember: $councilMember }
      orderBy: allocatedAt
      orderDirection: desc
    ) {
      votes {
        grantee {
          account
        }
        amount
      }
    }
  }
`;

export default function useAllocationQuery(
  network: Network,
  councilId: string,
  address: string,
) {
  const { data: allocationQueryRes } = useQuery(ALLOCATION_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
      councilMember: `${councilId?.toLowerCase()}-${address?.toLowerCase()}`,
    },
    skip: !address || !councilId,
    pollInterval: 10000,
  });
  const currentAllocation = allocationQueryRes?.allocations[0];
  const allocation = currentAllocation?.votes.map(
    ({
      grantee: { account },
      amount,
    }: {
      grantee: { account: string };
      amount: string;
    }) => {
      return {
        grantee: account,
        amount: Number(amount),
      };
    },
  );
  const votingPower = allocationQueryRes?.councilMember?.votingPower;

  return {
    allocation,
    votingPower,
  };
}
