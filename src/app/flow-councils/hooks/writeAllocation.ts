import { useState } from "react";
import { parseAbi } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

export default function useWriteAllocation(council: `0x${string}`) {
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
      const hash = await walletClient.writeContract({
        abi: parseAbi([
          "struct Allocation { address[] accounts; uint128[] amounts; }",
          "function allocateBudget(Allocation memory _allocation) public",
        ]),
        address: council,
        functionName: "allocateBudget",
        args: [
          {
            accounts,
            amounts,
          },
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
