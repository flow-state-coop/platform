"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, parseEventLogs, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery, useLazyQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Toast from "react-bootstrap/Toast";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { waitForReceipt } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { getApolloClient } from "@/lib/apollo";
import {
  networks,
  isSplitterFactoryDeployed,
  isFlowCouncilNetwork,
} from "@/lib/networks";
import { flowCouncilFactoryAbi } from "@/lib/abi/flowCouncilFactory";
import { superAppSplitterFactoryAbi } from "@/lib/abi/superAppSplitterFactory";

const SUPERAPP_SPLITTER_FEE_PORTION = BigInt(50);
const COUNCIL_INDEXING_POLL_MS = 2000;
const COUNCIL_INDEXING_MAX_ATTEMPTS = 60;

type LaunchProps = {
  defaultNetwork: Network;
  councilId?: string;
  isChainIdExplicit?: boolean;
};

type CustomTokenEntry = {
  address: string;
  symbol: string;
  validationError: string;
};

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      superToken
    }
  }
`;

const SUPERTOKEN_QUERY = gql`
  query SupertokenQuery($token: String!) {
    token(id: $token) {
      id
      isSuperToken
      symbol
    }
  }
`;

const TOKEN_VALIDATING_MESSAGE = "Validating...";

function getDefaultToken(network: Network): Token {
  return network.tokens.find((t) => t.symbol === "G$") ?? network.tokens[0];
}

async function waitForCouncilIndexing(
  chainId: number,
  councilId: string,
): Promise<boolean> {
  const client = getApolloClient("flowCouncil", chainId);

  for (let attempt = 0; attempt < COUNCIL_INDEXING_MAX_ATTEMPTS; attempt++) {
    try {
      const { data } = await client.query({
        query: FLOW_COUNCIL_QUERY,
        variables: { councilId },
        fetchPolicy: "network-only",
      });

      if (data?.flowCouncil) {
        return true;
      }
    } catch {
      // Transient subgraph errors shouldn't abort the wait
    }

    await new Promise((resolve) =>
      setTimeout(resolve, COUNCIL_INDEXING_POLL_MS),
    );
  }

  return false;
}

export default function Launch(props: LaunchProps) {
  const { defaultNetwork, councilId, isChainIdExplicit } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [selectedToken, setSelectedToken] = useState<Token>(
    getDefaultToken(defaultNetwork),
  );
  const [customTokenSelection, setCustomTokenSelection] = useState(false);
  const [customTokenEntry, setCustomTokenEntry] = useState<CustomTokenEntry>({
    address: "",
    symbol: "",
    validationError: "",
  });
  const [isIndexing, setIsIndexing] = useState(false);
  const [success, setSuccess] = useState(false);

  const customTokenRequestIdRef = useRef(0);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeWithProgress,
  } = useTransactionsQueue();
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", selectedNetwork.id),
      variables: { councilId: councilId?.toLowerCase() },
      pollInterval: 4000,
      skip: !councilId,
    });
  const [checkSuperToken] = useLazyQuery(SUPERTOKEN_QUERY, {
    client: getApolloClient("superfluid", selectedNetwork.id),
  });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil;

  const launchNetworks = useMemo(
    () => networks.filter(isFlowCouncilNetwork),
    [],
  );

  useEffect(() => {
    if (councilId || isChainIdExplicit || !connectedChain) {
      return;
    }

    const userNetwork = launchNetworks.find(
      (network) => network.id === connectedChain.id,
    );

    if (userNetwork) {
      setSelectedNetwork(userNetwork);
      setCustomTokenSelection(false);
      setSelectedToken(getDefaultToken(userNetwork));
    }
  }, [councilId, isChainIdExplicit, connectedChain, launchNetworks]);

  useEffect(() => {
    if (!flowCouncil?.superToken) {
      return;
    }

    const matchedToken = selectedNetwork.tokens.find(
      (token) =>
        token.address.toLowerCase() === flowCouncil.superToken.toLowerCase(),
    );

    if (matchedToken) {
      setCustomTokenSelection(false);
      setSelectedToken(matchedToken);

      return;
    }

    let cancelled = false;

    (async () => {
      const { data: superTokenQueryRes } = await checkSuperToken({
        variables: { token: flowCouncil.superToken.toLowerCase() },
      });

      if (cancelled) {
        return;
      }

      setCustomTokenSelection(true);
      setCustomTokenEntry({
        address: flowCouncil.superToken,
        symbol: superTokenQueryRes?.token?.symbol ?? "",
        validationError: "",
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [flowCouncil?.superToken, selectedNetwork.tokens, checkSuperToken]);

  const handleSubmit = async () => {
    if (!address || !publicClient) {
      return;
    }

    if (customTokenSelection && !isAddress(customTokenEntry.address)) {
      return;
    }

    const token = customTokenSelection
      ? (customTokenEntry.address as Address)
      : selectedToken.address;

    try {
      let flowCouncilAddress: Address = "" as Address;
      let splitterAddress = "";

      await executeWithProgress(async (onProgress) => {
        const hash = await writeContract(wagmiConfig, {
          address: selectedNetwork.flowCouncilFactory as Address,
          abi: flowCouncilFactoryAbi,
          functionName: "createFlowCouncil",
          args: ["", token],
        });

        const receipt = await waitForReceipt(publicClient, hash);

        const eventArgs = parseEventLogs({
          abi: flowCouncilFactoryAbi,
          eventName: ["FlowCouncilCreated"],
          logs: receipt.logs,
        })[0].args;

        flowCouncilAddress = eventArgs.flowCouncil;
        onProgress();

        if (isSplitterFactoryDeployed(selectedNetwork)) {
          const splitterHash = await writeContract(wagmiConfig, {
            address: selectedNetwork.superAppSplitterFactory as Address,
            abi: superAppSplitterFactoryAbi,
            functionName: "createSuperAppSplitter",
            args: [
              selectedNetwork.superfluidHost,
              token,
              address,
              eventArgs.distributionPool,
              SUPERAPP_SPLITTER_FEE_PORTION,
              [address],
            ],
          });

          const splitterReceipt = await waitForReceipt(
            publicClient,
            splitterHash,
          );

          const appRegisteredLogs = parseEventLogs({
            abi: [
              {
                type: "event",
                name: "AppRegistered",
                inputs: [{ name: "app", type: "address", indexed: true }],
              },
            ] as const,
            eventName: ["AppRegistered"],
            logs: splitterReceipt.logs,
          });

          if (!appRegisteredLogs.length) {
            throw new Error(
              "SuperApp Splitter deployment failed: AppRegistered event not found",
            );
          }

          splitterAddress = appRegisteredLogs[0].args.app;
          onProgress();
        }
      });

      await fetch("/api/flow-council/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: selectedNetwork.id,
          flowCouncilAddress,
          superappSplitterAddress: splitterAddress || undefined,
          name: "",
          description: "",
        }),
      });

      setIsIndexing(true);
      const indexed = await waitForCouncilIndexing(
        selectedNetwork.id,
        flowCouncilAddress.toLowerCase(),
      );
      setIsIndexing(false);

      router.push(
        `/flow-councils/launch/${selectedNetwork.id}/${flowCouncilAddress}`,
      );

      if (indexed) {
        setSuccess(true);
      }
    } catch {
      setIsIndexing(false);
      // Error state is handled by useTransactionsQueue
    }
  };

  if (councilId && !flowCouncilQueryLoading && !flowCouncil) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Flow Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-5 fw-semi-bold">
            Set Distribution
          </Card.Header>
          <Card.Body className="p-0">
            <Card.Text className="text-info">
              The following token will be distributed through your Flow Council.
            </Card.Text>
            <Dropdown>
              <Dropdown.Toggle
                disabled={!!councilId}
                className="d-flex justify-content-between align-items-center bg-white py-4 fw-semi-bold text-dark border-0"
                style={{ width: 256, paddingTop: 12, paddingBottom: 12 }}
              >
                <Stack
                  direction="horizontal"
                  gap={1}
                  className="align-items-center"
                >
                  <Image
                    src={selectedNetwork.icon}
                    alt="Network Icon"
                    width={18}
                    height={18}
                  />
                  {selectedNetwork.name}
                </Stack>
              </Dropdown.Toggle>
              <Dropdown.Menu className="border-0 p-2 lh-lg">
                {launchNetworks.map((network, i) => (
                  <Dropdown.Item
                    key={i}
                    className="fw-semi-bold"
                    onClick={() => {
                      setSelectedNetwork(network);
                      setCustomTokenSelection(false);
                      setSelectedToken(getDefaultToken(network));
                      router.replace(
                        `/flow-councils/launch?chainId=${network.id}`,
                        { scroll: false },
                      );
                    }}
                  >
                    <Stack direction="horizontal" gap={1}>
                      <Image
                        src={network.icon}
                        alt="Network Icon"
                        width={16}
                        height={16}
                      />
                      {network.name}
                    </Stack>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 1 : 3}
              className="align-items-start mt-2"
            >
              <Dropdown>
                <Dropdown.Toggle
                  disabled={!!councilId}
                  className="d-flex justify-content-between align-items-center bg-white py-4 fw-semi-bold text-dark border-0"
                  style={{ width: 256, paddingTop: 12, paddingBottom: 12 }}
                >
                  <Stack
                    direction="horizontal"
                    gap={1}
                    className="align-items-center"
                  >
                    {!customTokenSelection && (
                      <Image
                        src={selectedToken.icon}
                        alt="Token Icon"
                        width={18}
                        height={18}
                      />
                    )}
                    {customTokenSelection && customTokenEntry.symbol
                      ? customTokenEntry.symbol
                      : customTokenSelection
                        ? "Custom"
                        : selectedToken.symbol}
                  </Stack>
                </Dropdown.Toggle>
                <Dropdown.Menu className="border-0 p-2 lh-lg">
                  {selectedNetwork.tokens.map((token) => (
                    <Dropdown.Item
                      key={token.address}
                      className="fw-semi-bold"
                      onClick={() => {
                        setCustomTokenSelection(false);
                        setSelectedToken(token);
                      }}
                    >
                      <Stack direction="horizontal" gap={1}>
                        <Image
                          src={token.icon}
                          alt="Token Icon"
                          width={16}
                          height={16}
                        />
                        {token.symbol}
                      </Stack>
                    </Dropdown.Item>
                  ))}
                  <Dropdown.Item
                    className="fw-semi-bold"
                    onClick={() => setCustomTokenSelection(true)}
                  >
                    Custom
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              {customTokenSelection ? (
                <Stack
                  direction="vertical"
                  className="position-relative align-self-sm-end"
                >
                  <Form.Control
                    type="text"
                    disabled={!!councilId}
                    placeholder="SuperToken Address"
                    value={customTokenEntry.address}
                    className="border-0 fs-lg fw-semi-bold"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={async (e) => {
                      const value = e.target.value;
                      const requestId = ++customTokenRequestIdRef.current;

                      if (!isAddress(value)) {
                        setCustomTokenEntry({
                          address: value,
                          symbol: "",
                          validationError: "Invalid Address",
                        });

                        return;
                      }

                      setCustomTokenEntry({
                        address: value,
                        symbol: "",
                        validationError: TOKEN_VALIDATING_MESSAGE,
                      });

                      const { data: superTokenQueryRes } =
                        await checkSuperToken({
                          variables: { token: value.toLowerCase() },
                        });

                      if (requestId !== customTokenRequestIdRef.current) {
                        return;
                      }

                      const isSuperToken =
                        !!superTokenQueryRes?.token?.isSuperToken;

                      setCustomTokenEntry({
                        address: value,
                        symbol: isSuperToken
                          ? superTokenQueryRes.token.symbol
                          : "",
                        validationError: isSuperToken ? "" : "Not a SuperToken",
                      });
                    }}
                  />
                  {customTokenEntry.validationError && (
                    <Card.Text
                      className={`position-absolute mb-0 ms-2 ps-1 ${
                        customTokenEntry.validationError ===
                        TOKEN_VALIDATING_MESSAGE
                          ? "text-info"
                          : "text-danger"
                      }`}
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {customTokenEntry.validationError}
                    </Card.Text>
                  )}
                </Stack>
              ) : (
                <Stack direction="vertical" className="align-self-sm-end">
                  <Form.Control
                    type="text"
                    disabled
                    value={selectedToken.address}
                    className="border-0 fs-lg fw-semi-bold"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                  />
                </Stack>
              )}
            </Stack>
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="mt-4 mb-30">
          <Button
            disabled={
              !!councilId ||
              areTransactionsLoading ||
              isIndexing ||
              (customTokenSelection &&
                (customTokenEntry.address === "" ||
                  customTokenEntry.validationError !== ""))
            }
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={() =>
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== selectedNetwork.id
                  ? switchChain({ chainId: selectedNetwork.id })
                  : !session || session.address !== address
                    ? handleSignIn()
                    : handleSubmit()
            }
          >
            {areTransactionsLoading || isIndexing ? (
              <>
                <Spinner size="sm" className="ms-2" />
                {completedTransactions > 0 &&
                  ` ${completedTransactions}/${isSplitterFactoryDeployed(selectedNetwork) ? 2 : 1}`}
              </>
            ) : !address ? (
              "Connect Wallet"
            ) : connectedChain?.id !== selectedNetwork.id ? (
              "Switch Network"
            ) : !session || session.address !== address ? (
              "Sign In With Ethereum"
            ) : (
              "Launch"
            )}
          </Button>
          <Button
            variant="secondary"
            disabled={!councilId}
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            style={{ pointerEvents: areTransactionsLoading ? "none" : "auto" }}
            onClick={() =>
              router.push(
                `/flow-councils/round-metadata/${selectedNetwork.id}/${councilId}`,
              )
            }
          >
            Next
          </Button>
          <Toast
            show={success}
            delay={4000}
            autohide={true}
            onClose={() => setSuccess(false)}
            className="w-100 bg-success p-4 fw-semi-bold fs-6 text-white"
          >
            Success!
          </Toast>
          {transactionError ? (
            <Alert
              variant="danger"
              className="w-100 p-4 fw-semi-bold text-danger"
            >
              {transactionError}
            </Alert>
          ) : null}
        </Stack>
      </Stack>
    </>
  );
}
