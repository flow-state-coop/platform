import { useState } from "react";
import { Address } from "viem";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { Network } from "@/types/network";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";

export default function PoolConnectionButton(props: {
  network?: Network;
  poolAddress: string;
  isConnected: boolean;
}) {
  const { network, poolAddress, isConnected } = props;

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
        args: [poolAddress as Address, "0x"],
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

  return (
    <Button
      variant="secondary"
      onClick={handlePoolConnection}
      disabled={isConnected}
      className="w-100 text-white"
    >
      {isTransactionConfirming ? (
        <Spinner size="sm" />
      ) : isConnected ? (
        "Connected"
      ) : (
        "Connect"
      )}
    </Button>
  );
}
