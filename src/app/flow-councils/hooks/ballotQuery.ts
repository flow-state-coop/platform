import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const BALLOT_QUERY = gql`
  query BallotQuery(
    $flowCouncilId: String
    $voterId: String
    $voterAddress: String
  ) {
    voter(id: $voterId) {
      votingPower
      ballot {
        votes(where: { amount_gt: 0, recipient_: { id_not: null } }) {
          recipient {
            account
          }
          amount
        }
      }
    }
    recipients(
      where: {
        id_not: null
        flowCouncil: $flowCouncilId
        votes_: { votedBy: $voterAddress, amount_gt: 0 }
      }
    ) {
      account
      votes {
        amount
        votedBy
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
      voterId: `${flowCouncilId?.toLowerCase()}-${address?.toLowerCase()}`,
      voterAddress: `${address?.toLowerCase()}`,
    },
    skip: !address || !flowCouncilId,
    pollInterval: 10000,
  });
  const ballot = ballotQueryRes?.recipients?.map(
    (recipient: {
      account: string;
      votes: { votedBy: string; amount: number }[];
    }) => {
      return {
        recipient: recipient.account,
        amount: Number(
          recipient.votes?.find((x) => x.votedBy === address?.toLowerCase())
            ?.amount ?? 0,
        ),
      };
    },
  );
  const votingPower = ballotQueryRes?.voter?.votingPower;

  return {
    ballot,
    votingPower,
  };
}
