import { useState } from "react";
import { GetServerSideProps } from "next";
import { Address } from "viem";
import { useAccount, useReadContract, useConfig } from "wagmi";
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
import CopyTooltip from "@/components/CopyTooltip";
import useAdminParams from "@/hooks/adminParams";
import { networks } from "@/lib/networks";
import { strategyAbi } from "@/lib/abi/strategy";
import { erc20Abi } from "@/lib/abi/erc20";

type ReviewProps = {
  hostName: string;
};

type Recipient = {
  id: string;
  anchorAddress: string;
  recipientAddress: string;
  metadataCid: string;
  metadata: Metadata;
  status: Status;
};

type ReviewingRecipient = {
  id: string;
  newStatus: NewStatus;
};

type Metadata = {
  title: string;
  logoImg: string;
  bannerImg: string;
  bannerImgData: string;
  createdAt: number;
  description: string;
  website: string;
  projectTwitter: string;
};

type Status = "APPROVED" | "REJECTED" | "PENDING";

enum NewStatus {
  ACCEPTED = 2,
  REJECTED = 3,
}

const RECIPIENTS_QUERY = gql`
  query RecipientsQuery($chainId: Int, $poolId: String, $address: String) {
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
      poolChain {
        strategyAddress
      }
    }
  }
`;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req } = ctx;

  return { props: { hostName: req.headers.host } };
};

export default function Review(props: ReviewProps) {
  const { hostName } = props;

  const [reviewingRecipients, setReviewingRecipients] = useState<
    ReviewingRecipient[]
  >([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(
    null,
  );
  const [transactionsCompleted, setTransactionsCompleted] = useState(0);
  const [areTransactionsLoading, setAreTransactionsLoading] = useState(false);

  const { address, chain: connectedChain } = useAccount();
  const { profileId, poolId, chainId } = useAdminParams();
  const { data: queryRes, loading } = useQuery(RECIPIENTS_QUERY, {
    variables: {
      poolId,
      address: address?.toLowerCase() ?? "",
      chainId,
    },
    skip: !address || !poolId,
    pollInterval: 3000,
  });
  const { data: allocationToken } = useReadContract({
    abi: strategyAbi,
    address: queryRes?.recipients[0]?.poolChain.strategyAddress,
    functionName: "allocationSuperToken",
  });
  const { data: initialSuperAppBalance } = useReadContract({
    abi: strategyAbi,
    address: queryRes?.recipients[0]?.poolChain.strategyAddress,
    functionName: "initialSuperAppBalance",
  });
  const wagmiConfig = useConfig();

  const totalTransactions = 2;
  const network = networks.filter((network) => network.id === chainId)[0];
  const granteeRegistrationLink = `https://${hostName}/grantee/?poolid=${poolId}&chainid=${chainId}`;

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
  };

  const handleReview = async () => {
    if (!allocationToken) {
      throw Error("Allocation token not found");
    }

    if (!initialSuperAppBalance) {
      throw Error("Initial Superapp Balance not found");
    }

    const strategyAddress = queryRes.recipients[0].poolChain
      .strategyAddress as Address;

    setAreTransactionsLoading(true);

    try {
      const transferHash = await writeContract(wagmiConfig, {
        address: allocationToken as Address,
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
      });

      setTransactionsCompleted(1);

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

      setAreTransactionsLoading(false);
      setReviewingRecipients([]);
      setSelectedRecipient(null);
      setTransactionsCompleted(0);
    } catch (err) {
      setAreTransactionsLoading(false);
      console.error(err);
    }
  };

  return (
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      {!profileId ? (
        <>Program not found, please select one from Program Selection</>
      ) : connectedChain?.id !== chainId ? (
        <>Wrong network</>
      ) : loading ? (
        <Spinner className="m-auto" />
      ) : (
        <Stack direction="vertical" gap={2}>
          <Card.Text className="m-0">Application Link</Card.Text>
          <Stack direction="horizontal" gap={2} className="me-auto mb-4">
            <Badge className="d-flex align-items-center bg-transparent text-black border border-2 border-gray-500 p-2 fw-normal text-start h-100">
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
                  <th>Review</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queryRes?.recipients.map((recipient: Recipient, i: number) => (
                  <tr key={i}>
                    <td className="w-33">{recipient.recipientAddress}</td>
                    <td className="w-33">{recipient.metadata.title}</td>
                    <td className="text-center">
                      {recipient.status === "APPROVED" ? (
                        <Image src="/success.svg" alt="success" width={24} />
                      ) : recipient.status === "REJECTED" ? (
                        <Image src="/close.svg" alt="fail" width={24} />
                      ) : reviewingRecipients.find(
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
                        )?.newStatus === NewStatus.REJECTED ? (
                        <Image
                          src="/close.svg"
                          alt="fail"
                          width={24}
                          style={{
                            filter:
                              "invert(29%) sepia(96%) saturate(1955%) hue-rotate(334deg) brightness(88%) contrast(95%)",
                          }}
                        />
                      ) : null}
                    </td>
                    <td className="w-20">
                      {recipient.status === "PENDING" ? (
                        <Button
                          className="w-100 p-0"
                          onClick={() => {
                            setSelectedRecipient(recipient);
                          }}
                        >
                          Review
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
                    <Form.Label>Logo</Form.Label>
                    <Form.Control
                      value={`https://gateway.pinata.cloud/ipfs/${selectedRecipient.metadata.logoImg}`}
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
                <Button
                  variant="success"
                  className="w-50"
                  onClick={() => handleReviewSelection(NewStatus.ACCEPTED)}
                >
                  Accept
                </Button>
                <Button
                  variant="danger"
                  className="w-50"
                  onClick={() => handleReviewSelection(NewStatus.REJECTED)}
                >
                  Reject
                </Button>
              </Stack>
            </Stack>
          )}
          <Stack direction="horizontal" gap={1} className="mt-4">
            <Image src="/info.svg" alt="info" width={24} />
            <Card.Text className="m-0">
              A small{" "}
              {network?.tokens.find(
                (token) =>
                  allocationToken?.toLowerCase() ===
                  token.address.toLowerCase(),
              )?.name ?? "allocation token"}{" "}
              deposit transaction is required before adding grantees to the pool
            </Card.Text>
          </Stack>
          <Button
            className="d-flex gap-2 align-items-center justify-content-center w-25 mt-2"
            disabled={reviewingRecipients?.length === 0}
            onClick={handleReview}
          >
            {areTransactionsLoading ? (
              <>
                <Spinner size="sm" />
                {transactionsCompleted + 1}/{totalTransactions}
              </>
            ) : (
              "Accept Grantees (2)"
            )}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
