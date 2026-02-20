"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Card from "react-bootstrap/Card";
import Toast from "react-bootstrap/Toast";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Spinner from "react-bootstrap/Spinner";
import MarkdownEditor from "@/components/MarkdownEditor";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import Badge from "react-bootstrap/Badge";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import Dropdown from "react-bootstrap/Dropdown";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import CopyTooltip from "@/components/CopyTooltip";
import ViewProjectTab from "@/app/flow-councils/components/ViewProjectTab";
import ViewRoundTab from "@/app/flow-councils/components/ViewRoundTab";
import ViewAttestationTab from "@/app/flow-councils/components/ViewAttestationTab";
import InternalComments from "@/app/flow-councils/components/InternalComments";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { RECIPIENT_MANAGER_ROLE } from "../lib/constants";
import { getApolloClient } from "@/lib/apollo";
import type {
  RoundForm,
  AttestationForm,
} from "@/app/flow-councils/types/round";
import { ProjectDetails } from "@/types/project";

type ReviewProps = {
  chainId?: number;
  councilId?: string;
  hostname: string;
  csfrToken: string;
};

type ApplicationDetails = RoundForm & {
  attestation?: AttestationForm;
};

type Application = {
  id: number;
  projectId: number;
  roundId: number;
  fundingAddress: string;
  status: Status;
  projectDetails: ProjectDetails | null;
  details: ApplicationDetails | null;
  managerAddresses?: string[];
  managerEmails?: string[];
};

type Status =
  | "INCOMPLETE"
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "REMOVED"
  | "GRADUATED";

const STATUS_LABELS: Record<Status, string> = {
  INCOMPLETE: "Incomplete",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  CHANGES_REQUESTED: "Changes Requested",
  REJECTED: "Rejected",
  REMOVED: "Removed",
  GRADUATED: "Graduated",
};

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
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>("project");
  const [newStatus, setNewStatus] = useState<Status | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const topRef = useRef<HTMLDivElement>(null);
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
  const [roundName, setRoundName] = useState("Flow Council");

  useEffect(() => {
    if (!chainId || !councilId) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
        );
        const data = await res.json();

        if (data.success && data.round?.details) {
          const details =
            typeof data.round.details === "string"
              ? JSON.parse(data.round.details)
              : data.round.details;
          setRoundName(details?.name ?? "Flow Council");
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [chainId, councilId]);

  const handleExportCsv = useCallback(() => {
    if (!applications.length) return;

    const headers = [
      "application_status",
      "project_name",
      "funding_address",
      "manager_emails",
      "contact_name",
      "contact_telegram",
      "project_addresses",
      "goodcollective_pool_addresses",
      "x_handle",
      "farcaster_handle",
      "github_repo",
    ];

    const escCsv = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const rows = applications.map((app) => {
      const projectDetails = app.projectDetails;
      const smartContracts = projectDetails?.smartContracts ?? [];

      const projectAddresses = smartContracts
        .filter((sc) => sc.type === "projectAddress")
        .map((sc) => sc.address)
        .join("|");

      const goodCollectivePools = smartContracts
        .filter((sc) => sc.type === "goodCollectivePool")
        .map((sc) => sc.address)
        .join("|");

      const githubRepos = [
        projectDetails?.github,
        ...(projectDetails?.githubRepos ?? []),
      ]
        .filter(Boolean)
        .join("|");

      return [
        STATUS_LABELS[app.status] || app.status,
        projectDetails?.name ?? "",
        app.fundingAddress ?? "",
        (app.managerEmails ?? []).join("|"),
        app.details?.team?.primaryContact?.name ?? "",
        app.details?.team?.primaryContact?.telegram ?? "",
        projectAddresses,
        goodCollectivePools,
        projectDetails?.twitter ?? "",
        projectDetails?.farcaster ?? "",
        githubRepos,
      ].map(escCsv);
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const safeName = roundName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
    const filename = `${safeName}_${dateStr}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [applications, roundName]);

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

  // Get available statuses based on current status
  const availableStatuses = useMemo(() => {
    if (!selectedApplication) return [];
    const currentStatus = selectedApplication.status;

    if (currentStatus === "ACCEPTED") {
      return ["REMOVED", "GRADUATED", "CHANGES_REQUESTED"] as Status[];
    }

    if (currentStatus === "REMOVED") {
      return ["ACCEPTED", "CHANGES_REQUESTED"] as Status[];
    }

    if (currentStatus === "GRADUATED") {
      return ["ACCEPTED", "REMOVED", "CHANGES_REQUESTED"] as Status[];
    }

    // If not yet accepted, can accept, request changes, or reject
    return (["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"] as Status[]).filter(
      (s) => s !== currentStatus,
    );
  }, [selectedApplication]);

  const handleSelectApplication = (application: Application) => {
    setSelectedApplication(application);
    setSelectedTab("project");
    setNewStatus(null);
    setReviewComment("");
    setError("");
  };

  const handleCloseReview = () => {
    setSelectedApplication(null);
    setNewStatus(null);
    setReviewComment("");
    setError("");
  };

  const handleSubmitReview = async () => {
    if (!session) {
      throw Error("Account is not signed in");
    }

    if (!flowCouncil || !selectedApplication || !newStatus) {
      throw Error("Missing required data");
    }

    try {
      setIsSubmitting(true);
      setError("");

      // Check if on-chain transaction is needed
      // Only need on-chain tx when actually changing on-chain state:
      // - Adding: ACCEPTED (and not already on-chain)
      // - Removing: REMOVED/GRADUATED from ACCEPTED state
      const currentStatus = selectedApplication.status;
      const isAddingOnChain =
        newStatus === "ACCEPTED" && currentStatus !== "ACCEPTED";
      const isRemovingOnChain =
        (newStatus === "REMOVED" ||
          newStatus === "GRADUATED" ||
          newStatus === "CHANGES_REQUESTED") &&
        currentStatus === "ACCEPTED";

      if (isAddingOnChain || isRemovingOnChain) {
        const recipientStatus = isAddingOnChain ? 0 : 1; // 0 = ADDED, 1 = REMOVED

        const hash = await writeContract(wagmiConfig, {
          address: flowCouncil.id as Address,
          abi: flowCouncilAbi,
          functionName: "updateRecipients",
          args: [
            [
              {
                account: selectedApplication.fundingAddress as Address,
                status: recipientStatus,
              },
            ],
            [selectedApplication.projectDetails?.name ?? ""],
          ],
        });

        await publicClient?.waitForTransactionReceipt({
          hash,
          confirmations: 3,
          retryCount: 10,
        });
      }

      // Update status in DB and create automated message
      const res = await fetch("/api/flow-council/review", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
          applicationId: selectedApplication.id,
          newStatus,
          comment: reviewComment,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error);
        setIsSubmitting(false);
        return;
      }

      // Success - refresh applications and close panel
      setSuccess(true);
      fetchApplications();
      handleCloseReview();

      // Scroll to top
      topRef.current?.scrollIntoView({ behavior: "smooth" });

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
        <div ref={topRef} />
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

            {/* Applications Table */}
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
                    <th>Address</th>
                    <th>Name</th>
                    <th className="text-center">Status</th>
                    <th className="text-end">
                      {applications.length > 0 && (
                        <Button
                          variant="link"
                          className="p-0"
                          title="Export CSV"
                          onClick={handleExportCsv}
                        >
                          <Image
                            src="/csv.svg"
                            alt="Export CSV"
                            width={24}
                            height={24}
                          />
                        </Button>
                      )}
                    </th>
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
                      <td className="w-25 text-center align-middle">
                        {STATUS_LABELS[application.status] ||
                          application.status}
                      </td>
                      <td className="w-25 align-middle">
                        {application.status === "SUBMITTED" ? (
                          <Button
                            className="w-100 px-10 py-4 rounded-4 fw-semi-bold text-light"
                            onClick={() => handleSelectApplication(application)}
                          >
                            Review
                          </Button>
                        ) : application.status !== "INCOMPLETE" ? (
                          <Button
                            variant="secondary"
                            className="w-100 py-4 rounded-4 fw-semi-bold"
                            onClick={() => handleSelectApplication(application)}
                          >
                            Edit Status
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {selectedApplication !== null && (
              <Stack direction="vertical" gap={4} className="mt-4">
                <div className="bg-lace-100 rounded-4 p-4">
                  <Stack
                    direction="horizontal"
                    className="justify-content-between mb-4"
                  >
                    <h4 className="fw-bold mb-0">
                      {selectedApplication.projectDetails?.name ??
                        "Application Review"}
                    </h4>
                    <Button
                      variant="link"
                      className="p-0"
                      onClick={handleCloseReview}
                    >
                      <Image src="/close.svg" alt="Close" width={24} />
                    </Button>
                  </Stack>

                  <Row className="mb-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semi-bold">
                          Current Status
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={STATUS_LABELS[selectedApplication.status]}
                          disabled
                          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semi-bold">
                          New Status
                        </Form.Label>
                        <Dropdown>
                          <Dropdown.Toggle
                            variant="white"
                            className="w-100 d-flex justify-content-between align-items-center bg-white border border-2 border-dark rounded-4 py-3 px-3"
                          >
                            {newStatus
                              ? STATUS_LABELS[newStatus]
                              : "Select new status..."}
                          </Dropdown.Toggle>
                          <Dropdown.Menu className="w-100 border border-dark p-2 lh-lg">
                            {availableStatuses.map((status) => (
                              <Dropdown.Item
                                key={status}
                                onClick={() => setNewStatus(status)}
                              >
                                {STATUS_LABELS[status]}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-semi-bold">
                      Review Comment (Shared with the project)
                    </Form.Label>
                    <MarkdownEditor
                      rows={3}
                      value={reviewComment}
                      placeholder="Write a message..."
                      onChange={(e) => setReviewComment(e.target.value)}
                      resizable
                    />
                  </Form.Group>

                  <Button
                    className="w-100 py-4 rounded-4 fw-semi-bold"
                    disabled={!newStatus || isSubmitting}
                    onClick={() => {
                      !address && openConnectModal
                        ? openConnectModal()
                        : connectedChain?.id !== chainId
                          ? switchChain({ chainId })
                          : handleSubmitReview();
                    }}
                  >
                    {isSubmitting ? (
                      <Spinner size="sm" className="m-auto" />
                    ) : (
                      `Update to ${newStatus ? STATUS_LABELS[newStatus] : "..."}`
                    )}
                  </Button>

                  {error && (
                    <Alert
                      variant="danger"
                      className="mt-3 p-3 fw-semi-bold text-danger"
                    >
                      {error}
                    </Alert>
                  )}
                </div>

                <div className="bg-lace-100 rounded-4 p-4">
                  <Tab.Container
                    activeKey={selectedTab}
                    onSelect={(k) => setSelectedTab(k || "project")}
                  >
                    <Nav className="gap-2 mb-4 border-0">
                      <Nav.Item>
                        <Nav.Link
                          eventKey="project"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "project"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Project
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link
                          eventKey="round"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "round"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Round
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link
                          eventKey="eligibility"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "eligibility"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Attestation
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link
                          eventKey="comments"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "comments"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Comments
                        </Nav.Link>
                      </Nav.Item>
                    </Nav>

                    <Tab.Content>
                      <Tab.Pane eventKey="project">
                        <ViewProjectTab
                          projectDetails={selectedApplication.projectDetails}
                          managerAddresses={
                            selectedApplication.managerAddresses
                          }
                          managerEmails={selectedApplication.managerEmails}
                        />
                      </Tab.Pane>
                      <Tab.Pane eventKey="round">
                        <ViewRoundTab
                          roundData={
                            selectedApplication.details
                              ? {
                                  previousParticipation:
                                    selectedApplication.details
                                      .previousParticipation,
                                  maturityAndUsage:
                                    selectedApplication.details
                                      .maturityAndUsage,
                                  integration:
                                    selectedApplication.details.integration,
                                  buildGoals:
                                    selectedApplication.details.buildGoals,
                                  growthGoals:
                                    selectedApplication.details.growthGoals,
                                  team: selectedApplication.details.team,
                                  additional:
                                    selectedApplication.details.additional,
                                }
                              : null
                          }
                        />
                      </Tab.Pane>
                      <Tab.Pane eventKey="eligibility">
                        <ViewAttestationTab
                          attestationData={
                            selectedApplication.details?.attestation ??
                            (
                              selectedApplication.details as ApplicationDetails & {
                                eligibility?: AttestationForm;
                              }
                            )?.eligibility ??
                            null
                          }
                        />
                      </Tab.Pane>
                      <Tab.Pane eventKey="comments">
                        <InternalComments
                          applicationId={selectedApplication.id}
                          chainId={chainId}
                          councilId={councilId}
                        />
                      </Tab.Pane>
                    </Tab.Content>
                  </Tab.Container>
                </div>
              </Stack>
            )}

            <Stack direction="vertical" gap={3} className="mt-4 mb-30">
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
            </Stack>
          </>
        )}
      </Stack>
    </>
  );
}
