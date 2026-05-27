import { useState } from "react";
import { Address } from "viem";
import {
  useAccount,
  useWriteContract,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { Network } from "@/types/network";
import { gdaForwarderAbi } from "@sfpro/sdk/abi";
import { waitForReceipt } from "@/lib/utils";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";

export default function PoolConnectionButton(props: {
  network?: Network;
  poolAddress: string;
  isConnected: boolean;
  onSuccess?: () => void;
}) {
  const { network, poolAddress, isConnected, onSuccess } = props;

  const [isTransactionConfirming, setIsTransactionConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const publicClient = usePublicClient({ chainId: network?.id });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { address, chain: connectedChain } = useAccount();

  const handlePoolConnection = async () => {
    if (!network || !address || !publicClient) {
      return;
    }

    try {
      setIsTransactionConfirming(true);

      if (connectedChain?.id !== network.id) {
        await switchChainAsync({ chainId: network.id });
      }

      const hash = await writeContractAsync({
        address: network.gdaForwarder,
        abi: gdaForwarderAbi,
        functionName: "connectPool",
        args: [poolAddress as Address, "0x"],
        chainId: network.id,
      });

      await waitForReceipt(publicClient, hash);

      setIsTransactionConfirming(false);
      setIsSuccess(true);

      if (onSuccess) {
        setTimeout(onSuccess, 1500);
      }
    } catch (err) {
      console.error(err);

      setIsTransactionConfirming(false);
    }
  };

  return (
    <Button
      variant="secondary"
      onClick={handlePoolConnection}
      disabled={isConnected || isSuccess || isTransactionConfirming}
      className="w-100 text-white rounded-4 py-4 fw-semi-bold"
    >
      {isTransactionConfirming ? (
        <Spinner size="sm" />
      ) : isSuccess || isConnected ? (
        "Connected"
      ) : (
        "Connect"
      )}
    </Button>
  );
}
