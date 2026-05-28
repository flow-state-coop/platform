import { useEffect, useRef, useState } from "react";
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
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";

function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    (err as { name?: unknown }).name === "UserRejectedRequestError"
  );
}

export default function PoolConnectionButton(props: {
  network?: Network;
  poolAddress: string;
  isConnected: boolean;
  onSuccess?: () => void;
}) {
  const { network, poolAddress, isConnected, onSuccess } = props;

  const [isTransactionConfirming, setIsTransactionConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const publicClient = usePublicClient({ chainId: network?.id });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { address, chain: connectedChain } = useAccount();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const handlePoolConnection = async () => {
    if (!network || !address || !publicClient) {
      return;
    }

    try {
      setError(false);
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

      // The modal may have been dismissed mid-tx; don't write state or fire
      // onSuccess on a flow the parent no longer cares about.
      if (!mountedRef.current) return;

      setIsTransactionConfirming(false);
      setIsSuccess(true);

      if (onSuccess) {
        closeTimer.current = setTimeout(onSuccess, 1500);
      }
    } catch (err) {
      console.error(err);

      if (!mountedRef.current) return;

      setIsTransactionConfirming(false);
      // A deliberate wallet rejection (switch or tx) isn't a failure — reset
      // the button quietly instead of showing the error message.
      if (!isUserRejection(err)) {
        setError(true);
      }
    }
  };

  return (
    <Stack direction="vertical" className="w-100">
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
      {error && (
        <p className="text-danger small text-center mt-2 mb-0">
          Something went wrong. Please try again.
        </p>
      )}
    </Stack>
  );
}
