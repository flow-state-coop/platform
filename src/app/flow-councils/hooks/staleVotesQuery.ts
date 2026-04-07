import { useReadContract, useReadContracts } from "wagmi";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";

export default function useStaleVotesQuery(councilId: string, address: string) {
  const councilAddress = councilId as `0x${string}`;
  const voterAddress = address as `0x${string}`;
  const enabled = !!councilId && !!address;

  const { data: voterData, isLoading: isLoadingVoter } = useReadContract({
    address: councilAddress,
    abi: flowCouncilAbi,
    functionName: "getVoter",
    args: [voterAddress],
    query: {
      enabled,
    },
  });

  const votes = voterData?.votes ?? [];

  const { data: recipientResults, isLoading: isLoadingRecipients } =
    useReadContracts({
      contracts: votes.map((v) => ({
        address: councilAddress,
        abi: flowCouncilAbi,
        functionName: "recipientById" as const,
        args: [v.recipientId],
      })),
      query: {
        enabled: votes.length > 0,
      },
    });

  if (!enabled) {
    return { staleVotes: 0, isLoading: false };
  }

  if (isLoadingVoter || (votes.length > 0 && isLoadingRecipients)) {
    return { staleVotes: 0, isLoading: true };
  }

  if (!votes.length || !recipientResults) {
    return { staleVotes: 0, isLoading: false };
  }

  let stale = 0;

  for (let i = 0; i < votes.length; i++) {
    const recipient = recipientResults[i]?.result;

    if (
      recipient &&
      recipient[0] === "0x0000000000000000000000000000000000000000" &&
      votes[i].amount > 0n
    ) {
      stale += Number(votes[i].amount);
    }
  }

  return { staleVotes: stale, isLoading: false };
}
