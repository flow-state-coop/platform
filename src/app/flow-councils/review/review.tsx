"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, keccak256, encodePacked } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Card from "react-bootstrap/Card";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import Badge from "react-bootstrap/Badge";
import Sidebar from "../components/Sidebar";
import CopyTooltip from "@/components/CopyTooltip";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { councilAbi } from "@/lib/abi/council";
import { getApolloClient } from "@/lib/apollo";

type ReviewProps = {
  chainId?: number;
  councilId?: string;
  hostname: string;
  csfrToken: string;
};

type Application = {
  address: string;
  chainId: number;
  councilId: string;
  metadata: string;
  status: Status;
};

type ReviewingApplication = {
  address: string;
  metadata: string;
  newStatus: Status;
};

type CancelingAppplication = {
  address: string;
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
  userGithub: string;
  projectGithub: string;
};

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

const COUNCIL_QUERY = gql`
  query CouncilQuery($councilId: String!) {
    council(id: $councilId) {
      id
      maxAllocationsPerMember
      distributionToken
      metadata
      councilManagers {
        account
        role
      }
      councilMembers {
        id
        account
        votingPower
      }
    }
  }
`;

const PROFILES_QUERY = gql`
  query ProfilesQuery($chainId: Int!, $profileIds: [String!]) {
    profiles(
      first: 1000
      filter: { chainId: { equalTo: $chainId }, id: { in: $profileIds } }
    ) {
      id
      metadata
    }
  }
`;

export default function Review(props: ReviewProps) {
  const { chainId, councilId, hostname, csfrToken } = props;

  const [applications, setApplications] = useState<Application[]>([]);
  const [reviewingApplications, setReviewingApplications] = useState<
    ReviewingApplication[]
  >([]);
  const [cancelingApplications, setCancelingApplications] = useState<
    CancelingAppplication[]
  >([]);
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);
  const [selectedApplicationProfile, setSelectedApplicationProfile] = useState<{
    id: string;
    metadata: Metadata;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const router = useRouter();
  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { isMobile } = useMediaQuery();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: councilQueryRes, loading: councilQueryResLoading } = useQuery(
    COUNCIL_QUERY,
    {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        councilId: councilId?.toLowerCase(),
      },
      skip: !chainId || !councilId,
      pollInterval: 10000,
    },
  );
  const { data: flowStateQueryRes } = useQuery(PROFILES_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId,
      profileIds: applications?.map((application) => application.metadata),
    },
    pollInterval: 3000,
  });

  const granteeApplicationLink = `${hostname}/flow-councils/grantee/?councilId=${councilId}&chainId=${chainId}`;
  const council = councilQueryRes?.council;
  const profiles = flowStateQueryRes?.profiles;

  const fetchApplications = useCallback(async () => {
    if (!council || !address || !chainId) {
      return;
    }

    const applicationsRes = await fetch("/api/flow-council/applications", {
      method: "POST",
      body: JSON.stringify({
        chainId,
        councilId: council.id,
      }),
    });

    const { success, applications } = await applicationsRes.json();

    if (success) {
      setApplications(applications);
    }
  }, [council, address, chainId]);

  const isManager = useMemo(() => {
    const granteeManagerRole = keccak256(
      encodePacked(["string"], ["GRANTEE_MANAGER_ROLE"]),
    );
    const councilManager = council?.councilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() && m.role === granteeManagerRole,
    );

    if (councilManager) {
      return true;
    }

    return false;
  }, [address, council]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleReviewSelection = (newStatus: Status) => {
    if (!selectedApplication) {
      throw Error("No selected recipient");
    }

    const _reviewingApplications = [...reviewingApplications];
    const index = _reviewingApplications.findIndex(
      (application) => selectedApplication.address === application.address,
    );

    if (index === -1) {
      _reviewingApplications.push({
        address: selectedApplication.address,
        metadata: selectedApplication.metadata,
        newStatus,
      });
    } else {
      _reviewingApplications[index].newStatus = newStatus;
    }

    setReviewingApplications(_reviewingApplications);
    setSelectedApplication(null);
  };

  const handleCancelSelection = () => {
    if (!selectedApplication) {
      throw Error("No selected application");
    }

    const _cancelingApplications = [...cancelingApplications];

    _cancelingApplications.push({
      address: selectedApplication.address,
    });

    setCancelingApplications(_cancelingApplications);
    setSelectedApplication(null);
  };

  const handleSubmit = async () => {
    if (!session) {
      throw Error("Account is not signed in");
    }

    if (!council) {
      throw Error("Council not found");
    }

    try {
      setIsSubmitting(true);
      setError("");

      const approvedApplications = reviewingApplications.filter(
        (reviewingApplication) => reviewingApplication.newStatus === "APPROVED",
      );

      if (approvedApplications.length > 0 || cancelingApplications.length > 0) {
        const hash = await writeContract(wagmiConfig, {
          address: council.id as Address,
          abi: councilAbi,
          functionName: "updateCouncilGrantees",
          args: [
            approvedApplications
              .map((application) => {
                return {
                  account: application.address as Address,
                  metadata: application.metadata,
                  status: 0,
                };
              })
              .concat(
                cancelingApplications.map((cancelingApplication) => {
                  return {
                    account: cancelingApplication.address as Address,
                    metadata: "",
                    status: 1,
                  };
                }),
              ),
          ],
        });

        await publicClient?.waitForTransactionReceipt({
          hash,
          confirmations: 3,
        });
      }

      const res = await fetch("/api/flow-council/review", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: council.id,
          grantees: reviewingApplications
            .map((reviewingApplication) => {
              return {
                address: reviewingApplication.address,
                status: reviewingApplication.newStatus,
              };
            })
            .concat(
              cancelingApplications.map((cancelingApplication) => {
                return {
                  address: cancelingApplication.address,
                  status: "CANCELED",
                };
              }),
            ),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error);
      } else {
        setSuccess(true);
      }

      fetchApplications();

      setReviewingApplications([]);
      setCancelingApplications([]);
      setIsSubmitting(false);

      router.push(`/flow-councils/${chainId}/${councilId}`);
    } catch (err) {
      console.error(err);

      setIsSubmitting(false);
      setError("Error: Please retry later");
    }
  };

  if (!councilId || !chainId || (!councilQueryResLoading && !council)) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  if (council && !isManager) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Your are manager for this council. Please make sure the right wallet is
        connected
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
        <h1 className="mt-4">Manage Recipients</h1>
        <h2 className="fs-5 text-info">
          Review and/or remove eligible funding recipients from your Flow
          Council.
        </h2>
        <Card.Text className="mt-4">Application Link</Card.Text>
        <Stack direction="horizontal" gap={2} className="me-auto mb-5">
          <Badge className="d-flex align-items-center bg-transparent text-black border border-2 border-gray-500 p-2 fw-normal text-start h-100">
            {granteeApplicationLink}
          </Badge>
          <CopyTooltip
            contentClick="Link Copied"
            contentHover="Copy Link"
            target={<Image src="/copy.svg" alt="copy" width={28} />}
            handleCopy={() =>
              navigator.clipboard.writeText(granteeApplicationLink)
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
              {applications?.map((application: Application, i: number) => (
                <tr key={i}>
                  <td className="w-25">{application.address}</td>
                  <td className="w-25">
                    {profiles && profiles[i]
                      ? profiles[i].metadata.title
                      : "N/A"}
                  </td>
                  <td className="w-25 text-center ps-0">
                    {reviewingApplications.find(
                      (reviewingApplication) =>
                        application.address === reviewingApplication.address,
                    )?.newStatus === "APPROVED" ? (
                      <Image
                        src="/success.svg"
                        alt="success"
                        width={24}
                        style={{
                          filter:
                            "invert(38%) sepia(93%) saturate(359%) hue-rotate(100deg) brightness(92%) contrast(94%)",
                        }}
                      />
                    ) : reviewingApplications.find(
                        (reviewingApplication) =>
                          application.address === reviewingApplication.address,
                      )?.newStatus === "REJECTED" ||
                      cancelingApplications.find(
                        (cancelingApplication) =>
                          application.address === cancelingApplication.address,
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
                    ) : application.status === "APPROVED" ? (
                      <Image src="/success.svg" alt="success" width={24} />
                    ) : application.status === "REJECTED" ||
                      application.status === "CANCELED" ? (
                      <Image src="/close.svg" alt="fail" width={24} />
                    ) : null}
                  </td>
                  <td className="w-25">
                    {application.status === "PENDING" ? (
                      <Button
                        className="w-100 p-0 text-light"
                        onClick={() => {
                          setSelectedApplication(application);
                          setSelectedApplicationProfile(profiles[i]);
                        }}
                      >
                        Review
                      </Button>
                    ) : application.status === "APPROVED" ? (
                      <Button
                        variant="danger"
                        className="w-100 p-0"
                        onClick={() => {
                          setSelectedApplication(application);
                          setSelectedApplicationProfile(profiles[i]);
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
        {selectedApplication !== null &&
          selectedApplicationProfile !== null && (
            <Stack
              direction="vertical"
              className="mt-4 border border-3 border-gray rounded-4 p-4"
            >
              <Form className="d-flex flex-column gap-4">
                <Row>
                  <Col>
                    <Form.Label>Recipient Address</Form.Label>
                    <Form.Control
                      value={selectedApplication.address}
                      disabled
                    />
                  </Col>
                  <Col>
                    <Form.Label>Name</Form.Label>
                    <Form.Control
                      value={selectedApplicationProfile.metadata.title}
                      disabled
                    />
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <Form.Label>Website URL</Form.Label>
                    <Form.Control
                      value={selectedApplicationProfile.metadata.website}
                      disabled
                    />
                  </Col>
                  <Col>
                    <Form.Label>Twitter</Form.Label>
                    <Form.Control
                      value={`@${selectedApplicationProfile.metadata.projectTwitter}`}
                      disabled
                    />
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <Form.Label>Github User URL</Form.Label>
                    <Form.Control
                      value={
                        selectedApplicationProfile.metadata.userGithub
                          ? `https://github.com/${selectedApplicationProfile.metadata.userGithub}`
                          : ""
                      }
                      disabled
                    />
                  </Col>
                  <Col>
                    <Form.Label>Github Org URL</Form.Label>
                    <Form.Control
                      value={
                        selectedApplicationProfile.metadata.projectGithub
                          ? `https://github.com/${selectedApplicationProfile.metadata.projectGithub}`
                          : ""
                      }
                      disabled
                    />
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <Form.Label>Logo</Form.Label>
                    <Form.Control
                      value={`https://gateway.pinata.cloud/ipfs/${selectedApplicationProfile.metadata.logoImg}`}
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
                      value={selectedApplicationProfile.metadata.description}
                    />
                  </Col>
                </Row>
              </Form>
              <Stack direction="horizontal" gap={2} className="w-50 mt-4">
                {selectedApplication.status === "APPROVED" ? (
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
                      onClick={() => handleReviewSelection("APPROVED")}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="danger"
                      className="w-50"
                      onClick={() => handleReviewSelection("REJECTED")}
                    >
                      Reject
                    </Button>{" "}
                  </>
                )}
              </Stack>
            </Stack>
          )}
        <Button
          variant="secondary"
          className="d-flex justify-content-center align-items-center gap-2 mt-4 fs-5"
          disabled={!!session && session.address === address}
          onClick={() => {
            !address && openConnectModal
              ? openConnectModal()
              : connectedChain?.id !== chainId
                ? switchChain({ chainId })
                : handleSignIn(csfrToken);
          }}
        >
          {!!session && session.address === address && (
            <Image
              src="/check-circle.svg"
              alt=""
              width={26}
              height={26}
              style={{
                filter:
                  "brightness(0) saturate(100%) invert(10%) sepia(48%) saturate(2881%) hue-rotate(119deg) brightness(100%) contrast(99%)",
              }}
            />
          )}
          Sign In With Ethereum
        </Button>
        <Button
          className="mt-2 mb-4 fs-5"
          disabled={
            !session ||
            session.address !== address ||
            (reviewingApplications.length === 0 &&
              cancelingApplications.length === 0)
          }
          onClick={() => {
            !address && openConnectModal
              ? openConnectModal()
              : connectedChain?.id !== chainId
                ? switchChain({ chainId })
                : handleSubmit();
          }}
        >
          {isSubmitting ? <Spinner size="sm" className="m-auto" /> : "Submit"}
        </Button>
        <Toast
          show={success}
          delay={4000}
          autohide={true}
          onClose={() => setSuccess(false)}
          className="w-100 bg-success my-2 p-3 fs-5 text-light"
        >
          Success!
        </Toast>
        {error && (
          <Alert variant="danger" className="fs-6 text-danger">
            {error}
          </Alert>
        )}
      </Stack>
    </>
  );
}
