"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, parseEventLogs } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
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
import { useSession } from "next-auth/react";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import { flowCouncilFactoryAbi } from "@/lib/abi/flowCouncilFactory";
import { superAppSplitterFactoryAbi } from "@/lib/abi/superAppSplitterFactory";

const SUPERAPP_SPLITTER_SIDE_PORTION = BigInt(50);

type LaunchProps = {
  defaultNetwork: Network;
  councilId?: string;
  csrfToken: string;
};

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      superToken
    }
  }
`;

export default function Launch(props: LaunchProps) {
  const { defaultNetwork, councilId, csrfToken } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [success, setSuccess] = useState(false);

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
    executeLegacyTransactions,
  } = useTransactionsQueue();
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", selectedNetwork.id),
      variables: { councilId: councilId?.toLowerCase() },
      pollInterval: 4000,
      skip: !councilId,
    });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil;

  const launchNetworks = networks.filter((network) => network.label === "celo");
  const defaultToken =
    selectedNetwork.tokens.find((t) => t.symbol === "G$") ??
    selectedNetwork.tokens[0];

  useEffect(() => {
    if (councilId || !connectedChain) {
      return;
    }

    const userNetwork = launchNetworks.find(
      (network) => network.id === connectedChain.id,
    );

    if (userNetwork) {
      setSelectedNetwork(userNetwork);
    }
  }, [councilId, connectedChain, launchNetworks]);

  const handleSubmit = async () => {
    if (!address || !publicClient) {
      return;
    }

    const token = defaultToken.address;
    let flowCouncilAddress: Address = "" as Address;
    let distributionPool: Address = "" as Address;
    let splitterAddress = "";

    const transactions: (() => Promise<void>)[] = [
      async () => {
        const hash = await writeContract(wagmiConfig, {
          address: selectedNetwork.flowCouncilFactory as Address,
          abi: flowCouncilFactoryAbi,
          functionName: "createFlowCouncil",
          args: ["", token],
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 5,
        });

        const eventArgs = parseEventLogs({
          abi: flowCouncilFactoryAbi,
          eventName: ["FlowCouncilCreated"],
          logs: receipt.logs,
        })[0].args;

        flowCouncilAddress = eventArgs.flowCouncil;
        distributionPool = eventArgs.distributionPool;
      },
    ];

    if (selectedNetwork.superAppSplitterFactory) {
      transactions.push(async () => {
        const splitterHash = await writeContract(wagmiConfig, {
          address: selectedNetwork.superAppSplitterFactory as Address,
          abi: superAppSplitterFactoryAbi,
          functionName: "createSuperAppSplitter",
          args: [
            selectedNetwork.superfluidHost,
            token,
            address,
            distributionPool,
            selectedNetwork.feeRecipientPool,
            SUPERAPP_SPLITTER_SIDE_PORTION,
          ],
        });

        const splitterReceipt = await publicClient.waitForTransactionReceipt({
          hash: splitterHash,
          confirmations: 5,
        });

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
      });
    }

    try {
      await executeLegacyTransactions(transactions);

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

      router.push(
        `/flow-councils/launch/${selectedNetwork.id}/${flowCouncilAddress}`,
      );
      setSuccess(true);
    } catch {
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
                      router.push("/flow-councils/launch");
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
              <Stack
                direction="horizontal"
                gap={1}
                className="align-items-center bg-white py-4 fw-semi-bold text-dark rounded-2 px-3"
                style={{ width: 256, paddingTop: 12, paddingBottom: 12 }}
              >
                <Image
                  src={defaultToken.icon}
                  alt="Token"
                  width={18}
                  height={18}
                />
                {defaultToken.symbol}
              </Stack>
              <Stack direction="vertical" className="align-self-sm-end">
                <Form.Control
                  type="text"
                  disabled
                  value={defaultToken.address}
                  className="border-0 fs-lg fw-semi-bold"
                  style={{
                    paddingTop: 12,
                    paddingBottom: 12,
                  }}
                />
              </Stack>
            </Stack>
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="mt-4 mb-30">
          <Button
            disabled={!!councilId}
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={() =>
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== selectedNetwork.id
                  ? switchChain({ chainId: selectedNetwork.id })
                  : !session || session.address !== address
                    ? handleSignIn(csrfToken)
                    : handleSubmit()
            }
          >
            {areTransactionsLoading ? (
              <>
                <Spinner size="sm" className="ms-2" />
                {completedTransactions > 0 &&
                  ` ${completedTransactions}/${selectedNetwork.superAppSplitterFactory ? 2 : 1}`}
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
