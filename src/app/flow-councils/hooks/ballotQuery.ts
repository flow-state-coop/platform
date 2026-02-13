import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const BALLOT_QUERY = gql`
  query BallotQuery($councilId: String, $voter: String) {
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

export default function useBallotQuery(
  network: Network,
  councilId: string,
  address: string,
) {
  const { data: ballotQueryRes } = useQuery(BALLOT_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      councilId: councilId?.toLowerCase(),
      voter: `${councilId?.toLowerCase()}-${address?.toLowerCase()}`,
    },
    skip: !address || !councilId,
    pollInterval: 10000,
  });
  const currentBallot = ballotQueryRes?.ballots[0];
  const votes = currentBallot?.votes
    .filter(({ amount }: { amount: string }) => Number(amount) > 0)
    .map(
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
  const votingPower = ballotQueryRes?.voter?.votingPower;

  return {
    votes,
    votingPower,
  };
}
