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
import { Project } from "@/types/project";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { councilAbi } from "@/lib/abi/council";
import { getApolloClient } from "@/lib/apollo";

type ReviewProps = {
  chainId?: number;
  councilId?: string;
  hostname: string;
  csfrToken: string;
};

type Application = {
  owner: string;
  recipient: string;
  chainId: number;
  councilId: string;
  metadata: string;
  status: Status;
};

type ReviewingApplication = {
  owner: string;
  recipient: string;
  metadata: string;
  newStatus: Status;
};

type CancelingAppplication = {
  owner: string;
  recipient: string;
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
      metadataCid
    }
  }
`;

export default function Review(props: ReviewProps) {
  const { chainId, councilId, hostname, csfrToken } = props;

  const [profiles, setProfiles] = useState<Project[] | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [reviewingApplications, setReviewingApplications] = useState<
    ReviewingApplication[]
  >([]);
  const [cancelingApplications, setCancelingApplications] = useState<
    CancelingAppplication[]
  >([]);
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);
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

  const granteeApplicationLink = `${hostname}/gooddollar/grantee/?chainId=${chainId}`;
  const council = councilQueryRes?.council;
  const selectedApplicationProfile =
    profiles && selectedApplication
      ? profiles.find(
          (p: { id: string }) => p.id === selectedApplication.metadata,
        )
      : null;

  const fetchApplications = useCallback(async () => {
    if (!council || !address || !chainId) {
      return;
    }

    try {
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
    } catch (err) {
      console.error(err);
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
    (async () => {
      if (!flowStateQueryRes?.profiles) {
        return;
      }

      const profiles = [];

      for (const profile of flowStateQueryRes.profiles) {
        const metadata = await fetchIpfsJson(profile.metadataCid);

        if (metadata) {
          profiles.push({ ...profile, metadata });
        }
      }

      setProfiles(profiles);
    })();
  }, [flowStateQueryRes]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleReviewSelection = (newStatus: Status) => {
    if (!selectedApplication) {
      throw Error("No selected recipient");
    }

    const _reviewingApplications = [...reviewingApplications];
    const index = _reviewingApplications.findIndex(
      (application) => selectedApplication.owner === application.owner,
    );

    if (selectedApplication.status !== newStatus) {
      if (index === -1) {
        _reviewingApplications.push({
          owner: selectedApplication.owner,
          recipient: selectedApplication.recipient,
          metadata: selectedApplication.metadata,
          newStatus,
        });
      } else {
        _reviewingApplications[index].newStatus = newStatus;
      }
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
      owner: selectedApplication.owner,
      recipient: selectedApplication.recipient,
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
      const rejectedApplications = reviewingApplications.filter(
        (reviewingApplication) => reviewingApplication.newStatus === "REJECTED",
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
                  account: application.recipient as Address,
                  metadata: application.metadata,
                  status: 0,
                };
              })
              .concat(
                cancelingApplications.map((cancelingApplication) => {
                  return {
                    account: cancelingApplication.recipient as Address,
                    metadata: "",
                    status: 1,
                  };
                }),
              ),
          ],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({
          hash,
          confirmations: 3,
          retryCount: 10,
        });

        if (receipt?.status === "success") {
          const res = await fetch("/api/flow-council/review", {
            method: "POST",
            body: JSON.stringify({
              chainId,
              councilId: council.id,
              grantees: reviewingApplications
                .map((reviewingApplication) => {
                  return {
                    owner: reviewingApplication.owner,
                    status: reviewingApplication.newStatus,
                  };
                })
                .concat(
                  cancelingApplications.map((cancelingApplication) => {
                    return {
                      owner: cancelingApplication.owner,
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
        } else {
          setError("Transaction Reverted");
        }
      } else if (rejectedApplications.length > 0) {
        const res = await fetch("/api/flow-council/review", {
          method: "POST",
          body: JSON.stringify({
            chainId,
            councilId: council.id,
            grantees: rejectedApplications.map((reviewingApplication) => {
              return {
                owner: reviewingApplication.owner,
                status: reviewingApplication.newStatus,
              };
            }),
          }),
        });

        const json = await res.json();

        if (!json.success) {
          setError(json.error);
        } else {
          setSuccess(true);
        }
      }

      fetchApplications();

      setReviewingApplications([]);
      setCancelingApplications([]);
      setIsSubmitting(false);
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
          href="/gooddollar/launch"
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
        <h1 className="mt-4 fs-5 fw-semi-bold">Manage Recipients</h1>
        <h2 className="fs-md text-info">
          Review and/or remove eligible funding recipients from your Flow
          Council.
        </h2>
        {profiles === null || (!council && !isManager) ? (
          <Spinner className="mt-5 mx-auto" />
        ) : !isManager ? (
          <Stack
            direction="vertical"
            gap={2}
            className="align-items-center mt-5"
          >
            <Image src="/delete.svg" alt="" width={90} height={90} />
            <span className="text-center fs-5 fw-bold">
              You don't have access to this module. Check your connected
              wallet's permissions.
            </span>
          </Stack>
        ) : !session || session.address !== address ? (
          <Button
            variant="secondary"
            className="d-flex justify-content-center align-items-center gap-2 mt-5 fs-lg fw-semi-bold py-4 rounded-4"
            onClick={() => {
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== chainId
                  ? switchChain({ chainId })
                  : handleSignIn(csfrToken);
            }}
          >
            Sign In With Ethereum
          </Button>
        ) : (
          <>
            <Card.Text className="mt-4">Application Link</Card.Text>
            <Stack
              direction="horizontal"
              gap={2}
              className="w-100 me-auto mb-5 overflow-hidden"
            >
              <Badge className="d-flex align-items-center bg-white text-black fw-semi-bold border border-4 border-dark p-2 fw-normal text-truncate text-start h-100">
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
              className="border border-4 border-dark"
              style={{
                height: 280,
                overflow: "auto",
                border: "1px solid #dee2e6",
              }}
            >
              <Table striped hover>
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Name</th>
                    <th className="text-center">Review</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {applications?.map((application: Application, i: number) => (
                    <tr key={i}>
                      <td className="w-25 align-middle">{application.owner}</td>
                      <td className="w-25 align-middle">
                        {profiles && profiles[i]
                          ? profiles.find(
                              (p: { id: string }) =>
                                p.id === application.metadata,
                            )?.metadata.title
                          : "N/A"}
                      </td>
                      <td className="w-25 text-center ps-0 align-middle">
                        {reviewingApplications.find(
                          (reviewingApplication) =>
                            application.owner === reviewingApplication.owner,
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
                              application.owner === reviewingApplication.owner,
                          )?.newStatus === "REJECTED" ||
                          cancelingApplications.find(
                            (cancelingApplication) =>
                              application.owner === cancelingApplication.owner,
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
                      <td className="w-25 align-middle">
                        {application.status === "PENDING" ? (
                          <Button
                            className="w-100 px-10 py-4 rounded-4 fw-semi-bold text-light"
                            onClick={() => {
                              setSelectedApplication(application);
                            }}
                          >
                            Review
                          </Button>
                        ) : application.status === "APPROVED" ? (
                          <Button
                            variant="danger"
                            className="w-100 py-4 rounded-4 fw-semi-bold text-light"
                            onClick={() => {
                              setSelectedApplication(application);
                            }}
                          >
                            Kick from Pool
                          </Button>
                        ) : application.status === "REJECTED" ? (
                          <Button
                            className="w-100 px-10 py-4 rounded-4 fw-semi-bold text-light"
                            onClick={() => {
                              setSelectedApplication(application);
                            }}
                          >
                            View
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {selectedApplication !== null && selectedApplicationProfile && (
              <Stack
                direction="vertical"
                className="mt-4 bg-lace-100 rounded-4 p-4"
              >
                <Form className="d-flex flex-column gap-4">
                  <Row>
                    <Col>
                      <Form.Label>Applicant Address</Form.Label>
                      <Form.Control
                        value={selectedApplication.owner}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Funding Address</Form.Label>
                      <Form.Control
                        value={selectedApplication.recipient}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                  <Row>
                    <Col>
                      <Form.Label>Name</Form.Label>
                      <Form.Control
                        value={selectedApplicationProfile.metadata.title}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Website URL</Form.Label>
                      <Form.Control
                        value={selectedApplicationProfile.metadata.website}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                  <Row>
                    <Col>
                      <Form.Label>Twitter</Form.Label>
                      <Form.Control
                        value={`@${selectedApplicationProfile.metadata.projectTwitter ?? ""}`}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Farcaster</Form.Label>
                      <Form.Control
                        value={`@${selectedApplicationProfile.metadata.projectWarpcast ?? ""}`}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
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
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
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
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                  <Row>
                    <Col>
                      <Form.Label>Karma GAP</Form.Label>
                      <Form.Control
                        value={
                          selectedApplicationProfile.metadata.karmaGap
                            ? `gap.karmahq.xyz/project/${selectedApplicationProfile.metadata.karmaGap}`
                            : ""
                        }
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Application Link</Form.Label>
                      <Form.Control
                        value={selectedApplicationProfile.metadata.appLink}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                  <Row>
                    <Col>
                      <Form.Label>Logo</Form.Label>
                      <Form.Control
                        value={
                          selectedApplicationProfile.metadata.logoImg
                            ? `https://gateway.pinata.cloud/ipfs/${selectedApplicationProfile.metadata.logoImg}`
                            : ""
                        }
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Banner</Form.Label>
                      <Form.Control
                        value={
                          selectedApplicationProfile.metadata.bannerImg
                            ? `https://gateway.pinata.cloud/ipfs/${selectedApplicationProfile.metadata.bannerImg}`
                            : ""
                        }
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
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
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                </Form>
                <Stack direction="horizontal" gap={2} className="w-50 mt-4">
                  {selectedApplication.status === "APPROVED" ? (
                    <Button
                      variant="danger"
                      className="w-50 py-4 rounded-4 fw-semi-bold text-light"
                      onClick={handleCancelSelection}
                    >
                      Kick from Pool
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="w-50 text-light py-4 rounded-4 fw-semi-bold"
                        onClick={() => handleReviewSelection("APPROVED")}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="danger"
                        className="w-50 py-4 rounded-4 fw-semi-bold text-light"
                        onClick={() => handleReviewSelection("REJECTED")}
                      >
                        Reject
                      </Button>{" "}
                    </>
                  )}
                </Stack>
              </Stack>
            )}
            <Stack direction="vertical" gap={3} className="mt-4 mb-30">
              <Button
                className="py-4 rounded-4 fs-lg fw-semi-bold"
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
                {isSubmitting ? (
                  <Spinner size="sm" className="m-auto" />
                ) : (
                  "Submit"
                )}
              </Button>
              <Button
                variant="secondary"
                className="py-4 rounded-4 fs-lg fw-semi-bold"
                style={{ pointerEvents: isSubmitting ? "none" : "auto" }}
                onClick={() => router.push(`/gooddollar/?chainId=${chainId}`)}
              >
                Next
              </Button>
              <Toast
                show={success}
                delay={4000}
                autohide={true}
                onClose={() => setSuccess(false)}
                className="w-100 bg-success p-4 fw-semi-bold text-light"
              >
                Success!
              </Toast>
              {error && (
                <Alert
                  variant="danger"
                  className="p-4 fw-semi-bold text-danger"
                >
                  {error}
                </Alert>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </>
  );
}
