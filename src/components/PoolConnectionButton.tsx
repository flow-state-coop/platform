import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { MatchingPool } from "@/types/matchingPool";
import { Network } from "@/types/network";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";

export default function PoolConnectionButton(props: {
  matchingPool: MatchingPool;
  network?: Network;
}) {
  const { matchingPool, network } = props;

  const [isTransactionConfirming, setIsTransactionConfirming] = useState(false);

  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();

  const handlePoolConnection = async () => {
    if (!network || !address || !publicClient) {
      return;
    }

    try {
      setIsTransactionConfirming(true);

      const hash = await writeContractAsync({
        address: network.gdaForwarder,
        abi: gdaForwarderAbi,
        functionName: "connectPool",
        args: [matchingPool.id, "0x"],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 5,
      });

      setIsTransactionConfirming(false);
    } catch (err) {
      console.error(err);

      setIsTransactionConfirming(false);
    }
  };

  const isConnected = matchingPool.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  )?.isConnected;

  return (
    <Button
      variant="secondary"
      onClick={handlePoolConnection}
      disabled={isConnected}
      className="w-100 mt-3 text-white"
    >
      {isTransactionConfirming ? (
        <Spinner size="sm" />
      ) : isConnected ? (
        "Connected"
      ) : (
        "Connect to Pool"
      )}
    </Button>
  );
}
