import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const ALLOCATION_QUERY = gql`
  query AllocationQuery($councilId: String, $voter: String) {
    voter(id: $voter) {
      votingPower
    }
    ballots(
      first: 1
      where: { flowCouncil: $councilId, voter: $voter }
      orderBy: createdAtTimestamp
      orderDirection: desc
    ) {
      votes {
        recipient {
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
      voter: `${councilId?.toLowerCase()}-${address?.toLowerCase()}`,
    },
    skip: !address || !councilId,
    pollInterval: 10000,
  });
  const currentAllocation = allocationQueryRes?.ballots[0];
  const allocation = currentAllocation?.votes.map(
    ({
      recipient: { account },
      amount,
    }: {
      recipient: { account: string };
      amount: string;
    }) => {
      return {
        recipient: account,
        amount: Number(amount),
      };
    },
  );
  const votingPower = allocationQueryRes?.voter?.votingPower;

  return {
    allocation,
    votingPower,
  };
}
