import { useState } from "react";
import { parseAbi } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

export default function useWriteBallot(flowCouncil: `0x${string}`) {
  const [transactionError, setTransactionError] = useState("");
  const [isVoting, setIsVoting] = useState(false);

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const vote = async (
    votes: { recipient: `0x${string}`; amount: number }[],
  ) => {
    if (!walletClient || !publicClient) {
      throw new Error("Public client was not found");
    }

    setIsVoting(true);
    setTransactionError("");

    try {
      const hash = await walletClient.writeContract({
        abi: parseAbi([
          "struct Vote { address recipient; uint96 amount; }",
          "function vote(Vote[] memory _votes) external",
        ]),
        address: flowCouncil,
        functionName: "vote",
        args: [
          votes.map((vote) => {
            return { recipient: vote.recipient, amount: BigInt(vote.amount) };
          }),
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 3,
      });

      if (receipt.status !== "success") {
        throw Error(`Transaction status: ${receipt.status}`);
      }

      setIsVoting(false);

      return receipt;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      let errorMessage = "An error occured executing the transaction";

      if (err.message?.includes("User rejected the request")) {
        errorMessage = "Transaction rejected";
      }

      setTransactionError(errorMessage);
      setIsVoting(false);

      console.error(err);
    }
  };

  return { vote, isVoting, transactionError };
}
