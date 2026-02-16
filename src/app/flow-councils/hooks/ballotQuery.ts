import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const BALLOT_QUERY = gql`
  query BallotQuery($voter: String) {
    voter(id: $voter) {
      votingPower
      ballot {
        votes {
          recipient {
            account
          }
          amount
        }
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
      voter: `${councilId?.toLowerCase()}-${address?.toLowerCase()}`,
    },
    skip: !address || !councilId,
    pollInterval: 10000,
  });
  const voter = ballotQueryRes?.voter;
  const votes = voter?.ballot?.votes
    ?.filter(
      (v: { recipient: { account: string } | null; amount: string }) =>
        v.recipient !== null && Number(v.amount) > 0,
    )
    .map(
      ({
        recipient,
        amount,
      }: {
        recipient: { account: string };
        amount: string;
      }) => ({
        recipient: recipient.account,
        amount: Number(amount),
      }),
    );

  return {
    votes,
    votingPower: voter?.votingPower,
  };
}
