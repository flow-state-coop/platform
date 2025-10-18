import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Address, parseAbi } from "viem";
import { useAccount, usePublicClient, useConfig, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { Network } from "@/types/network";

type StreamDeletionModalProps = {
  show: boolean;
  network: Network;
  isMatchingPool: boolean;
  token: string;
  receiver: string;
  hide: () => void;
};

export default function StreamDeletionModal(props: StreamDeletionModalProps) {
  const { show, network, isMatchingPool, receiver, token, hide } = props;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const deleteStream = async () => {
    if (!address || !publicClient) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      let hash;

      if (connectedChain?.id !== network.id) {
        await switchChain({ chainId: network.id });
      }

      if (isMatchingPool) {
        hash = await writeContract(wagmiConfig, {
          abi: parseAbi([
            "function distributeFlow(address token, address from, address pool, int96 requestedFlowRate, bytes userData)",
          ]),
          address: network.gdaForwarder,
          functionName: "distributeFlow",
          args: [
            token as Address,
            address,
            receiver as Address,
            BigInt(0),
            "0x",
          ],
          chainId: network.id,
        });
      } else {
        hash = await writeContract(wagmiConfig, {
          abi: parseAbi([
            "function deleteFlow(address token, address sender, address receiver, bytes userData)",
          ]),
          address: network.cfaForwarder,
          functionName: "deleteFlow",
          args: [token as Address, address, receiver as Address, "0x"],
          chainId: network.id,
        });
      }

      const urlSearchParams = new URLSearchParams(searchParams.toString());

      urlSearchParams.delete("editPoolDistribution");
      urlSearchParams.delete("recipientId");
      router.replace(`${pathname}?${urlSearchParams}`);

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      setIsLoading(false);

      hide();
    } catch (err) {
      console.error(err);

      setError("There was an error, please try again later");
      setIsLoading(false);
    }
  };

  return (
    <Modal
      show={show}
      contentClassName="bg-lace-100 p-4 rounded-4"
      centered
      scrollable
      onHide={hide}
    >
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fs-5 fw-semi-bold">
          Are you sure you want to close your stream?
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-lace-100 mt-8">
        <Stack direction="horizontal" gap={3} className="justify-content-end">
          <Button className="w-33 py-4 rounded-4 fw-semi-bold" onClick={hide}>
            Nevermind
          </Button>
          <Button
            variant="danger"
            className="w-33 py-4 rounded-4 fw-semi-bold text-light"
            onClick={deleteStream}
            style={{ pointerEvents: isLoading ? "none" : "auto" }}
          >
            {isLoading ? <Spinner size="sm" /> : "Yes, close it"}
          </Button>
        </Stack>
        {error ? (
          <Alert
            variant="danger"
            className="mt-3 mb-0 text-danger p-4 fw-semi-bold"
          >
            {error}
          </Alert>
        ) : null}
      </Modal.Body>
    </Modal>
  );
}
