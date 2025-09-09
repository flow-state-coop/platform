import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const BALLOT_QUERY = gql`
  query BallotQuery($flowCouncilId: String, $voter: String) {
    voter(id: $voter) {
      votingPower
    }
    ballots(
      first: 1
      where: { flowCouncil: $flowCouncilId, voter: $voter }
      orderBy: createdAtTimestamp
      orderDirection: desc
    ) {
      votes(where: { amount_gt: 0 }) {
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
  flowCouncilId: string,
  address: string,
) {
  const { data: ballotQueryRes } = useQuery(BALLOT_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: {
      flowCouncilId: flowCouncilId?.toLowerCase(),
      voter: `${flowCouncilId?.toLowerCase()}-${address?.toLowerCase()}`,
    },
    skip: !address || !flowCouncilId,
    pollInterval: 10000,
  });
  const currentBallot = ballotQueryRes?.ballots[0];
  const ballot = currentBallot?.votes.map(
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
    ballot,
    votingPower,
  };
}
