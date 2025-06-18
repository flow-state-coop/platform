"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Address, formatEther } from "viem";
import { useAccount, useReadContract, useConfig, useSwitchChain } from "wagmi";
import { writeContract, waitForTransactionReceipt } from "@wagmi/core";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Sidebar from "../components/Sidebar";
import CopyTooltip from "@/components/CopyTooltip";
import { ProjectMetadata } from "@/types/project";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useFlowingAmount from "@/hooks/flowingAmount";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "../lib/networks";
import { strategyAbi } from "@/lib/abi/strategy";
import { erc20Abi } from "@/lib/abi/erc20";
import { ZERO_ADDRESS } from "@/lib/constants";

type ReviewProps = {
  chainId: number | null;
  profileId: string | null;
  poolId: string | null;
};

type Recipient = {
  id: string;
  anchorAddress: string;
  recipientAddress: string;
  metadataCid: string;
  metadata: ProjectMetadata;
  status: Status;
};

type ReviewingRecipient = {
  id: string;
  newStatus: NewStatus;
};

type CancelingRecipient = {
  id: string;
};

type Status = "APPROVED" | "REJECTED" | "PENDING" | "CANCELED";

enum NewStatus {
  ACCEPTED = 2,
  REJECTED = 3,
}

const RECIPIENTS_QUERY = gql`
  query RecipientsQuery($chainId: Int!, $poolId: String!, $address: String!) {
    recipients(
      filter: {
        chainId: { equalTo: $chainId }
        poolChain: {
          poolRolesByChainIdAndPoolId: {
            some: { address: { equalTo: $address } }
          }
        }
        poolId: { equalTo: $poolId }
        tags: { contains: "allo" }
      }
    ) {
      id
      recipientAddress
      anchorAddress
      metadata
      metadataCid
      status
    }
    pool(chainId: $chainId, id: $poolId) {
      allocationToken
      strategyAddress
    }
  }
`;

const SF_ACCOUNT_QUERY = gql`
  query SFAccountQuery($userAddress: String, $token: String) {
    account(id: $userAddress) {
      id
      accountTokenSnapshots(where: { token: $token }) {
        balanceUntilUpdatedAt
        updatedAtTimestamp
        totalNetFlowRate
        token {
          id
          isNativeAssetSuperToken
          underlyingAddress
        }
      }
    }
  }
`;

export default function Review(props: ReviewProps) {
  const { chainId, profileId, poolId } = props;

  const [reviewingRecipients, setReviewingRecipients] = useState<
    ReviewingRecipient[]
  >([]);
  const [cancelingRecipients, setCancelingRecipients] = useState<
    CancelingRecipient[]
  >([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(
    null,
  );
  const [transactions, setTransactions] = useState<(() => Promise<void>)[]>([]);
  const [showNextButton, setShowNextButton] = useState(false);

  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { isMobile } = useMediaQuery();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: queryRes, loading } = useQuery(RECIPIENTS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      poolId,
      address: address?.toLowerCase() ?? "",
      chainId,
    },
    skip: !address || !poolId,
    pollInterval: 4000,
  });
  const { data: initialSuperAppBalance } = useReadContract({
    abi: strategyAbi,
    address: queryRes?.pool?.strategyAddress,
    functionName: "initialSuperAppBalance",
  });
  const wagmiConfig = useConfig();

  const recipients = queryRes?.recipients ?? null;
  const pool = queryRes?.pool ?? null;
  const allocationToken = pool ? (pool.allocationToken as Address) : null;
  const network = networks.filter((network) => network.id === chainId)[0];
  const hostName =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";
  const granteeRegistrationLink = `${hostName}/grantee/?poolId=${poolId}&chainId=${chainId}`;
  const allocationTokenSymbol =
    network?.tokens.find(
      (token) => allocationToken === token.address.toLowerCase(),
    )?.symbol ?? "allocation token";

  const { data: superfluidQueryRes } = useQuery(SF_ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", chainId ?? 10),
    variables: {
      userAddress: address?.toLowerCase() ?? "0x",
      token: allocationToken,
    },
    pollInterval: 10000,
  });

  const isAllocationTokenPureSuperToken =
    !superfluidQueryRes?.account?.token?.isNativeAssetSuperToken &&
    superfluidQueryRes?.account?.token?.underlyingAddress === ZERO_ADDRESS;
  const allocationTokenBalance = useFlowingAmount(
    BigInt(
      superfluidQueryRes?.account?.accountTokenSnapshots[0]
        ?.balanceUntilUpdatedAt ?? 0,
    ),
    superfluidQueryRes?.account?.accountTokenSnapshots[0]?.updatedAtTimestamp ??
      0,
    BigInt(
      superfluidQueryRes?.account?.accountTokenSnapshots[0]?.totalNetFlowRate ??
        0,
    ),
  );

  useEffect(() => {
    if (!pool) {
      return;
    }

    const strategyAddress = pool.strategyAddress as Address;
    const transactions = [];

    const transferInitialSuperappBalance = async () => {
      if (!allocationToken) {
        throw Error("Allocation token not found");
      }

      if (!initialSuperAppBalance) {
        throw Error("Initial Superapp Balance not found");
      }

      const transferHash = await writeContract(wagmiConfig, {
        address: allocationToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [
          strategyAddress,
          initialSuperAppBalance * BigInt(reviewingRecipients.length),
        ],
      });

      await waitForTransactionReceipt(wagmiConfig, {
        chainId: network.id,
        hash: transferHash,
        confirmations: 2,
      });
    };

    const reviewRecipients = async () => {
      const reviewHash = await writeContract(wagmiConfig, {
        address: strategyAddress,
        abi: strategyAbi,
        functionName: "reviewRecipients",
        args: [
          reviewingRecipients.map((recipient) => recipient.id as Address),
          reviewingRecipients.map((recipient) => recipient.newStatus),
        ],
      });

      await waitForTransactionReceipt(wagmiConfig, {
        chainId: network.id,
        hash: reviewHash,
      });
    };

    const cancelRecipients = async () => {
      const cancelHash = await writeContract(wagmiConfig, {
        address: strategyAddress,
        abi: strategyAbi,
        functionName: "cancelRecipients",
        args: [
          cancelingRecipients.map((recipient) => recipient.id as `0x${string}`),
        ],
      });

      await waitForTransactionReceipt(wagmiConfig, {
        chainId: network.id,
        hash: cancelHash,
      });
    };

    if (reviewingRecipients.length > 0) {
      transactions.push(transferInitialSuperappBalance, reviewRecipients);
    }

    if (cancelingRecipients.length > 0) {
      transactions.push(cancelRecipients);
    }

    setTransactions(transactions);
  }, [
    reviewingRecipients,
    cancelingRecipients,
    initialSuperAppBalance,
    allocationToken,
    network,
    pool,
    wagmiConfig,
  ]);

  const handleReviewSelection = (newStatus: NewStatus) => {
    if (!selectedRecipient) {
      throw Error("No selected recipient");
    }

    const _reviewingRecipients = [...reviewingRecipients];
    const index = _reviewingRecipients.findIndex(
      (recipient) => selectedRecipient.id === recipient.id,
    );

    if (index === -1) {
      _reviewingRecipients.push({
        id: selectedRecipient.id,
        newStatus,
      });
    } else {
      _reviewingRecipients[index].newStatus = newStatus;
    }

    setReviewingRecipients(_reviewingRecipients);
    setSelectedRecipient(null);
  };

  const handleCancelSelection = () => {
    if (!selectedRecipient) {
      throw Error("No selected recipient");
    }

    const _cancelingRecipients = [...cancelingRecipients];

    _cancelingRecipients.push({
      id: selectedRecipient.id,
    });

    setCancelingRecipients(_cancelingRecipients);
    setSelectedRecipient(null);
  };

  const handleSubmit = async () => {
    try {
      await executeTransactions(transactions);

      setReviewingRecipients([]);
      setCancelingRecipients([]);
      setShowNextButton(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <Sidebar />
      <Stack direction="vertical" className={!isMobile ? "w-75" : "w-100"}>
        <Stack direction="vertical" gap={4} className="px-5 py-4 mb-5">
          {!profileId || !chainId ? (
            <Card.Text>
              Program not found, please select one from{" "}
              <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : loading || !chainId ? (
            <Spinner className="m-auto" />
          ) : !poolId ? (
            <Card.Text>
              Pool not found, please select one from{" "}
              <Link
                href={`/sqf/pools/?chainId=${chainId}&profileId=${profileId}`}
              >
                Pool Selection
              </Link>
            </Card.Text>
          ) : !connectedChain ? (
            <>Please connect a wallet</>
          ) : connectedChain?.id !== chainId ? (
            <Card.Text>
              Wrong network, please connect to{" "}
              <span
                className="p-0 text-decoration-underline cursor-pointer"
                onClick={() => switchChain({ chainId: network?.id ?? 10 })}
              >
                {network?.name}
              </span>{" "}
              or return to <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : (
            <Stack direction="vertical" gap={2} className="overflow-hidden">
              <Card.Text className="m-0">Application Link</Card.Text>
              <Stack
                direction="horizontal"
                gap={2}
                className="me-auto mb-4 w-100"
              >
                <Badge className="d-flex align-items-center bg-transparent text-black border border-2 border-gray-500 p-2 fw-normal text-start h-100 text-truncate">
                  {granteeRegistrationLink}
                </Badge>
                <CopyTooltip
                  contentClick="Link Copied"
                  contentHover="Copy Link"
                  target={<Image src="/copy.svg" alt="copy" width={28} />}
                  handleCopy={() =>
                    navigator.clipboard.writeText(granteeRegistrationLink)
                  }
                />
              </Stack>
              <div
                style={{
                  height: 280,
                  overflow: "auto",
                  border: "1px solid #dee2e6",
                }}
              >
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Name</th>
                      <th className="text-center">Review</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients?.map((recipient: Recipient, i: number) => (
                      <tr key={i}>
                        <td className="w-25">{recipient.recipientAddress}</td>
                        <td className="w-25">{recipient.metadata.title}</td>
                        <td className="w-25 text-center ps-0">
                          {reviewingRecipients.find(
                            (reviewingRecipient) =>
                              recipient.id === reviewingRecipient.id,
                          )?.newStatus === NewStatus.ACCEPTED ? (
                            <Image
                              src="/success.svg"
                              alt="success"
                              width={24}
                              style={{
                                filter:
                                  "invert(38%) sepia(93%) saturate(359%) hue-rotate(100deg) brightness(92%) contrast(94%)",
                              }}
                            />
                          ) : reviewingRecipients.find(
                              (reviewingRecipient) =>
                                recipient.id === reviewingRecipient.id,
                            )?.newStatus === NewStatus.REJECTED ||
                            cancelingRecipients.find(
                              (cancelingRecipient) =>
                                recipient.id === cancelingRecipient.id,
                            ) ? (
                            <Image
                              src="/close.svg"
                              alt="fail"
                              width={24}
                              style={{
                                filter:
                                  "invert(29%) sepia(96%) saturate(1955%) hue-rotate(334deg) brightness(88%) contrast(95%)",
                              }}
                            />
                          ) : recipient.status === "APPROVED" ? (
                            <Image
                              src="/success.svg"
                              alt="success"
                              width={24}
                            />
                          ) : recipient.status === "REJECTED" ||
                            recipient.status === "CANCELED" ? (
                            <Image src="/close.svg" alt="fail" width={24} />
                          ) : null}
                        </td>
                        <td className="w-25">
                          {recipient.status === "PENDING" ? (
                            <Button
                              className="w-100 p-0 text-light"
                              onClick={() => {
                                setSelectedRecipient(recipient);
                              }}
                            >
                              Review
                            </Button>
                          ) : recipient.status === "APPROVED" ? (
                            <Button
                              variant="danger"
                              className="w-100 p-0"
                              onClick={() => {
                                setSelectedRecipient(recipient);
                              }}
                            >
                              Kick from Pool
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              {selectedRecipient !== null && (
                <Stack
                  direction="vertical"
                  className="mt-4 border border-3 border-gray rounded-4 p-4"
                >
                  <Form className="d-flex flex-column gap-4">
                    <Row>
                      <Col>
                        <Form.Label>Recipient Address</Form.Label>
                        <Form.Control
                          value={selectedRecipient.recipientAddress}
                          disabled
                        />
                      </Col>
                      <Col>
                        <Form.Label>Name</Form.Label>
                        <Form.Control
                          value={selectedRecipient.metadata.title}
                          disabled
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <Form.Label>Website URL</Form.Label>
                        <Form.Control
                          value={selectedRecipient.metadata.website}
                          disabled
                        />
                      </Col>
                      <Col>
                        <Form.Label>Twitter</Form.Label>
                        <Form.Control
                          value={`@${selectedRecipient.metadata.projectTwitter}`}
                          disabled
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <Form.Label>Github User URL</Form.Label>
                        <Form.Control
                          value={
                            selectedRecipient.metadata.userGithub
                              ? `https://github.com/${selectedRecipient.metadata.userGithub}`
                              : ""
                          }
                          disabled
                        />
                      </Col>
                      <Col>
                        <Form.Label>Github Org URL</Form.Label>
                        <Form.Control
                          value={
                            selectedRecipient.metadata.projectGithub
                              ? `https://github.com/${selectedRecipient.metadata.projectGithub}`
                              : ""
                          }
                          disabled
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <Form.Label>Karma GAP</Form.Label>
                        <Form.Control
                          value={
                            selectedRecipient.metadata.karmaGap
                              ? `gap.karmahq.xyz/project/${selectedRecipient.metadata.karmaGap}`
                              : ""
                          }
                          disabled
                        />
                      </Col>
                      <Col>
                        <Form.Label>Logo</Form.Label>
                        <Form.Control
                          value={
                            selectedRecipient.metadata.logoImg
                              ? `https://gateway.pinata.cloud/ipfs/${selectedRecipient.metadata.logoImg}`
                              : ""
                          }
                          disabled
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <Form.Label>Description</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          disabled
                          style={{ resize: "none" }}
                          value={selectedRecipient.metadata.description}
                        />
                      </Col>
                    </Row>
                  </Form>
                  <Stack direction="horizontal" gap={2} className="w-50 mt-4">
                    {selectedRecipient.status === "APPROVED" ? (
                      <Button
                        variant="danger"
                        className="w-50"
                        onClick={handleCancelSelection}
                      >
                        Kick from Pool
                      </Button>
                    ) : (
                      <>
                        <Button
                          className="w-50 text-light"
                          onClick={() =>
                            handleReviewSelection(NewStatus.ACCEPTED)
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          variant="danger"
                          className="w-50"
                          onClick={() =>
                            handleReviewSelection(NewStatus.REJECTED)
                          }
                        >
                          Reject
                        </Button>{" "}
                      </>
                    )}
                  </Stack>
                </Stack>
              )}
              <Stack
                direction="horizontal"
                gap={2}
                className="align-items-start mt-4"
              >
                <Image src="/info.svg" alt="info" width={24} />
                <Stack direction="vertical">
                  <Card.Text className="m-0">
                    A small {allocationTokenSymbol} deposit transaction is
                    required before adding grantees to the pool.
                  </Card.Text>
                  <Card.Text className="m-0">
                    Your Balance:{" "}
                    {parseFloat(
                      Number(formatEther(allocationTokenBalance)).toFixed(6),
                    )}
                  </Card.Text>
                  <Card.Text>
                    <Card.Link
                      href={`https://jumper.exchange/?fromChain=${chainId}&fromToken=0x0000000000000000000000000000000000000000&toChain=${chainId}&toToken=${allocationToken}`}
                      target="_blank"
                      className="text-primary text-decoration-none"
                    >
                      Swap
                    </Card.Link>{" "}
                    {!isAllocationTokenPureSuperToken && (
                      <>
                        or{" "}
                        <Card.Link
                          href="https://app.superfluid.finance/wrap?upgrade"
                          target="_blank"
                          className="text-primary text-decoration-none"
                        >
                          Wrap
                        </Card.Link>
                      </>
                    )}{" "}
                    to {allocationTokenSymbol}
                  </Card.Text>
                </Stack>
              </Stack>
              <Stack direction={isMobile ? "vertical" : "horizontal"} gap={3}>
                <Button
                  disabled={
                    transactions.length === 0 ||
                    (transactions.length > 1 && allocationTokenBalance <= 0)
                  }
                  className="d-flex gap-2 align-items-center justify-content-center mt-2 text-light"
                  style={{ width: isMobile ? "100%" : "25%" }}
                  onClick={handleSubmit}
                >
                  {areTransactionsLoading ? (
                    <>
                      <Spinner size="sm" />
                      {completedTransactions + 1}/{transactions.length}
                    </>
                  ) : (
                    `Submit ${transactions.length > 0 ? "(" + transactions.length + ")" : ""}`
                  )}
                </Button>
                {transactionError && (
                  <Card.Text className="m-0 overflow-hidden text-danger text-break">
                    {transactionError}
                  </Card.Text>
                )}
                <Button
                  variant="secondary"
                  disabled={!showNextButton || !poolId}
                  className="d-flex gap-2 justify-content-center align-items-center mt-2 p-0 border-0 text-light"
                  style={{ width: isMobile ? "100%" : "25%" }}
                >
                  <Link
                    href={`/sqf/matching/?chainId=${chainId}&profileId=${profileId}&poolId=${poolId}`}
                    className="w-100 text-light text-decoration-none"
                    style={{ paddingTop: 6, paddingBottom: 6 }}
                  >
                    Next
                  </Link>
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>
    </>
  );
}
