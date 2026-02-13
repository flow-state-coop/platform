import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";

export default function useWriteBallot(council: `0x${string}`) {
  const [transactionError, setTransactionError] = useState("");
  const [isVoting, setIsVoting] = useState(false);

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const vote = async (accounts: `0x${string}`[], amounts: bigint[]) => {
    if (!walletClient || !publicClient) {
      throw new Error("Public client was not found");
    }

    setIsVoting(true);
    setTransactionError("");

    try {
      const votes = accounts.map((recipient, i) => ({
        recipient,
        amount: amounts[i],
      }));

      const hash = await walletClient.writeContract({
        abi: flowCouncilAbi,
        address: council,
        functionName: "vote",
        args: [votes],
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
