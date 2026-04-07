import { useMemo } from "react";
import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const BALLOT_QUERY = gql`
  query BallotQuery($voter: String) {
    voter(id: $voter) {
      id
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
  enabled = true,
) {
  const voterId = `${councilId?.toLowerCase()}-${address?.toLowerCase()}`;

  const { data: ballotQueryRes } = useQuery(BALLOT_QUERY, {
    client: getApolloClient("flowCouncil", network.id),
    variables: { voter: voterId },
    skip: !address || !councilId || !enabled,
    pollInterval: 10000,
  });

  const voter = ballotQueryRes?.voter;

  return useMemo(() => {
    if (voter && voter.id !== voterId) {
      return { votes: undefined, votingPower: undefined };
    }

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
  }, [voter, voterId]);
}
