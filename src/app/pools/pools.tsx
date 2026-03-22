"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address, isAddress } from "viem";
import { useAccount, useSwitchChain, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import { Network } from "@/types/network";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { superfluidPoolAbi } from "@/lib/abi/superfluidPool";

type PoolsProps = {
  defaultNetwork: Network;
  defaultPoolAddress?: string;
};

export default function Pools(props: PoolsProps) {
  const { defaultNetwork, defaultPoolAddress } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [poolAddress, setPoolAddress] = useState(defaultPoolAddress ?? "");
  const [validationError, setValidationError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const router = useRouter();
  const { isMobile } = useMediaQuery();
  const { chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const isValidAddress = isAddress(poolAddress);

  const {
    data: superToken,
    error: superTokenError,
    isLoading: superTokenLoading,
  } = useReadContract({
    address: poolAddress as Address,
    abi: superfluidPoolAbi,
    functionName: "superToken",
    chainId: selectedNetwork.id,
    query: { enabled: isValidAddress },
  });

  useEffect(() => {
    if (!isValidAddress) {
      setIsValidating(false);
      return;
    }

    if (superTokenLoading) {
      setIsValidating(true);
      setValidationError("");
      return;
    }

    setIsValidating(false);

    if (
      superTokenError ||
      !superToken ||
      superToken === "0x0000000000000000000000000000000000000000"
    ) {
      setValidationError(
        "Not a valid Superfluid distribution pool on this network",
      );
    } else {
      setValidationError("");
    }
  }, [isValidAddress, superToken, superTokenError, superTokenLoading]);

  const handleSubmit = () => {
    if (!isValidAddress) {
      setValidationError("Invalid address format");
      return;
    }

    if (validationError || isValidating) {
      return;
    }

    router.push(`/pools/${selectedNetwork.id}/${poolAddress}`);
  };

  return (
    <Stack
      direction="vertical"
      gap={6}
      className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
    >
      <Stack direction="vertical" gap={3}>
        <h1 className="fs-3 fw-semi-bold m-0 mt-3">Distribution Pools</h1>
        <h2 className="fs-lg">
          View and manage any Superfluid GDA distribution pool.
        </h2>
        <Dropdown>
          <Dropdown.Toggle
            variant="transparent"
            className={`d-flex justify-content-between align-items-center border border-dark border-4 rounded-4 py-4 fs-lg fw-semi-bold ${isMobile ? "" : "w-20"}`}
          >
            {selectedNetwork.name}
          </Dropdown.Toggle>
          <Dropdown.Menu className="border border-4 border-dark lh-lg">
            {networks.map((network, i) => (
              <Dropdown.Item
                key={i}
                className="fw-semi-bold"
                onClick={() => {
                  if (!connectedChain && openConnectModal) {
                    openConnectModal();
                  } else if (connectedChain?.id !== network.id) {
                    switchChain({ chainId: network.id });
                  }

                  setSelectedNetwork(network);
                  setValidationError("");
                }}
              >
                {network.name}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <Stack direction="vertical" gap={2}>
          <Form.Control
            type="text"
            placeholder="Pool contract address (0x...)"
            value={poolAddress}
            className="border border-dark border-4 rounded-4 py-4 fs-lg fw-semi-bold"
            onChange={(e) => {
              setPoolAddress(e.target.value);
              setValidationError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit();
              }
            }}
          />
          {poolAddress && !isValidAddress && (
            <Alert variant="danger" className="mb-0 py-2">
              Invalid address format
            </Alert>
          )}
          {validationError && isValidAddress && (
            <Alert variant="danger" className="mb-0 py-2">
              {validationError}
            </Alert>
          )}
        </Stack>
        <Button
          disabled={
            !isValidAddress || !!validationError || isValidating || !poolAddress
          }
          className="w-100 rounded-4 py-4 fs-5 fw-semi-bold"
          onClick={handleSubmit}
        >
          {isValidating ? <Spinner size="sm" /> : "View Pool"}
        </Button>
      </Stack>
    </Stack>
  );
}
