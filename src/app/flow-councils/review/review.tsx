"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address } from "viem";
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
import Sidebar from "@/app/flow-councils/components/Sidebar";
import CopyTooltip from "@/components/CopyTooltip";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { RECIPIENT_MANAGER_ROLE } from "../lib/constants";
import { getApolloClient } from "@/lib/apollo";

type ReviewProps = {
  chainId?: number;
  councilId?: string;
  hostname: string;
  csfrToken: string;
};

type ProjectDetails = {
  name?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  github?: string;
};

type Application = {
  id: number;
  projectId: number;
  roundId: number;
  fundingAddress: string;
  status: Status;
  projectDetails: ProjectDetails | null;
};

type ReviewingApplication = {
  id: number;
  fundingAddress: string;
  projectDetails: ProjectDetails | null;
  newStatus: Status;
};

type CancelingApplication = {
  id: number;
  fundingAddress: string;
};

type Status =
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "REMOVED"
  | "GRADUATED";

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      maxVotingSpread
      superToken
      flowCouncilManagers {
        account
        role
      }
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
    CancelingApplication[]
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
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryResLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        councilId: councilId?.toLowerCase(),
      },
      skip: !chainId || !councilId,
      pollInterval: 10000,
    });

  const granteeApplicationLink = `${hostname}/flow-councils/application/${chainId}/${councilId}`;
  const flowCouncil = flowCouncilQueryRes?.flowCouncil;

  const fetchApplications = useCallback(async () => {
    if (!flowCouncil || !address || !chainId) {
      return;
    }

    try {
      const applicationsRes = await fetch("/api/flow-council/applications", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
        }),
      });

      const { success, applications } = await applicationsRes.json();

      if (success) {
        setApplications(applications);
      }
    } catch (err) {
      console.error(err);
    }
  }, [flowCouncil, address, chainId]);

  const isManager = useMemo(() => {
    const flowCouncilManager = flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() &&
        m.role === RECIPIENT_MANAGER_ROLE,
    );

    if (flowCouncilManager) {
      return true;
    }

    return false;
  }, [address, flowCouncil]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleReviewSelection = (newStatus: Status) => {
    if (!selectedApplication) {
      throw Error("No selected recipient");
    }

    const _reviewingApplications = [...reviewingApplications];
    const index = _reviewingApplications.findIndex(
      (application) => selectedApplication.id === application.id,
    );

    if (selectedApplication.status !== newStatus) {
      if (index === -1) {
        _reviewingApplications.push({
          id: selectedApplication.id,
          fundingAddress: selectedApplication.fundingAddress,
          projectDetails: selectedApplication.projectDetails,
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
      id: selectedApplication.id,
      fundingAddress: selectedApplication.fundingAddress,
    });

    setCancelingApplications(_cancelingApplications);
    setSelectedApplication(null);
  };

  const handleSubmit = async () => {
    if (!session) {
      throw Error("Account is not signed in");
    }

    if (!flowCouncil) {
      throw Error("Flow Council not found");
    }

    try {
      setIsSubmitting(true);
      setError("");

      const acceptedApplications = reviewingApplications.filter(
        (reviewingApplication) => reviewingApplication.newStatus === "ACCEPTED",
      );
      const rejectedApplications = reviewingApplications.filter(
        (reviewingApplication) => reviewingApplication.newStatus === "REJECTED",
      );

      if (acceptedApplications.length > 0 || cancelingApplications.length > 0) {
        // Build recipients array and metadata array for updateRecipients
        const recipientsToAdd = acceptedApplications.map((application) => ({
          account: application.fundingAddress as Address,
          status: 0, // Status.ADDED
        }));
        const metadataToAdd = acceptedApplications.map(
          (application) => application.projectDetails?.name ?? "",
        );

        const recipientsToRemove = cancelingApplications.map(
          (cancelingApplication) => ({
            account: cancelingApplication.fundingAddress as Address,
            status: 1, // Status.REMOVED
          }),
        );
        const metadataToRemove = cancelingApplications.map(() => "");

        const hash = await writeContract(wagmiConfig, {
          address: flowCouncil.id as Address,
          abi: flowCouncilAbi,
          functionName: "updateRecipients",
          args: [
            [...recipientsToAdd, ...recipientsToRemove],
            [...metadataToAdd, ...metadataToRemove],
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
              councilId: flowCouncil.id,
              applications: reviewingApplications
                .map((reviewingApplication) => {
                  return {
                    id: reviewingApplication.id,
                    status: reviewingApplication.newStatus,
                  };
                })
                .concat(
                  cancelingApplications.map((cancelingApplication) => {
                    return {
                      id: cancelingApplication.id,
                      status: "REMOVED" as Status,
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
            councilId: flowCouncil.id,
            applications: rejectedApplications.map((reviewingApplication) => {
              return {
                id: reviewingApplication.id,
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

  if (!councilId || !chainId || (!flowCouncilQueryResLoading && !flowCouncil)) {
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
        {!flowCouncil && !isManager ? (
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
                      <td className="w-25 align-middle">
                        {application.fundingAddress}
                      </td>
                      <td className="w-25 align-middle">
                        {application.projectDetails?.name ?? "N/A"}
                      </td>
                      <td className="w-25 text-center ps-0 align-middle">
                        {reviewingApplications.find(
                          (reviewingApplication) =>
                            application.id === reviewingApplication.id,
                        )?.newStatus === "ACCEPTED" ? (
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
                              application.id === reviewingApplication.id,
                          )?.newStatus === "REJECTED" ||
                          cancelingApplications.find(
                            (cancelingApplication) =>
                              application.id === cancelingApplication.id,
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
                        ) : application.status === "ACCEPTED" ? (
                          <Image src="/success.svg" alt="success" width={24} />
                        ) : application.status === "REJECTED" ||
                          application.status === "REMOVED" ? (
                          <Image src="/close.svg" alt="fail" width={24} />
                        ) : null}
                      </td>
                      <td className="w-25 align-middle">
                        {application.status === "SUBMITTED" ? (
                          <Button
                            className="w-100 px-10 py-4 rounded-4 fw-semi-bold text-light"
                            onClick={() => {
                              setSelectedApplication(application);
                            }}
                          >
                            Review
                          </Button>
                        ) : application.status === "ACCEPTED" ? (
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
            {selectedApplication !== null && (
              <Stack
                direction="vertical"
                className="mt-4 bg-lace-100 rounded-4 p-4"
              >
                <Form className="d-flex flex-column gap-4">
                  <Row>
                    <Col>
                      <Form.Label>Funding Address</Form.Label>
                      <Form.Control
                        value={selectedApplication.fundingAddress}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                  <Row>
                    <Col>
                      <Form.Label>Name</Form.Label>
                      <Form.Control
                        value={selectedApplication.projectDetails?.name ?? ""}
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Website URL</Form.Label>
                      <Form.Control
                        value={
                          selectedApplication.projectDetails?.website ?? ""
                        }
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                  <Row>
                    <Col>
                      <Form.Label>Twitter</Form.Label>
                      <Form.Control
                        value={
                          selectedApplication.projectDetails?.twitter
                            ? `@${selectedApplication.projectDetails.twitter}`
                            : ""
                        }
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Github</Form.Label>
                      <Form.Control
                        value={
                          selectedApplication.projectDetails?.github
                            ? `https://github.com/${selectedApplication.projectDetails.github}`
                            : ""
                        }
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
                          selectedApplication.projectDetails?.logoUrl ?? ""
                        }
                        disabled
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                    <Col>
                      <Form.Label>Banner</Form.Label>
                      <Form.Control
                        value={
                          selectedApplication.projectDetails?.bannerUrl ?? ""
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
                        value={
                          selectedApplication.projectDetails?.description ?? ""
                        }
                        className="border-0 bg-light rounded-4 p-4 fw-semi-bold"
                      />
                    </Col>
                  </Row>
                </Form>
                <Stack direction="horizontal" gap={2} className="w-50 mt-6">
                  {selectedApplication.status === "ACCEPTED" ? (
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
                        onClick={() => handleReviewSelection("ACCEPTED")}
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
                onClick={() =>
                  router.push(`/flow-councils/${chainId}/${councilId}`)
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
