import { useState } from "react";
import { useAccount, useConfig, usePublicClient, useSwitchChain } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { waitForReceipt } from "@/lib/utils";

export default function useWriteBallot(
  council: `0x${string}`,
  chainId: number,
) {
  const [transactionError, setTransactionError] = useState("");
  const [isVoting, setIsVoting] = useState(false);

  const config = useConfig();
  const publicClient = usePublicClient({ chainId });
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const vote = async (accounts: `0x${string}`[], amounts: bigint[]) => {
    if (!publicClient) {
      throw new Error("Public client was not found");
    }

    setIsVoting(true);
    setTransactionError("");

    try {
      if (connectedChain?.id !== chainId) {
        await switchChainAsync({ chainId });
      }

      const walletClient = await getWalletClient(config, { chainId });
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

      const receipt = await waitForReceipt(publicClient, hash);

      if (receipt.status !== "success") {
        throw Error(`Transaction status: ${receipt.status}`);
      }

      setIsVoting(false);

      return receipt;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      let errorMessage = "An error occured executing the transaction";

      if (
        err.message?.includes("User rejected the request") ||
        err.name === "UserRejectedRequestError" ||
        err.code === 4001
      ) {
        errorMessage = "Transaction rejected";
      }

      setTransactionError(errorMessage);
      setIsVoting(false);

      console.error(err);
    }
  };

  return { vote, isVoting, transactionError };
}
