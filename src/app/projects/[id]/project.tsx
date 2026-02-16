"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import { usePostHog } from "posthog-js/react";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import Markdown from "@/components/Markdown";
import ProjectModal from "@/app/flow-councils/components/ProjectModal";
import ProjectFeedTab from "@/app/projects/[id]/ProjectFeedTab";
import ProjectMilestonesTab from "@/app/projects/[id]/milestones/ProjectMilestonesTab";
import { ProjectDetails } from "@/types/project";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getPlaceholderImageSrc } from "@/lib/utils";

type ProjectProps = {
  projectId: string;
  csrfToken: string;
  editMode: boolean;
};

type ProjectData = {
  id: number;
  details: ProjectDetails | null;
  managerAddresses: string[];
  managerEmails: string[];
  createdAt: string;
  updatedAt: string;
};

const VALID_TABS = ["details", "feed", "milestones"];

export default function Project(props: ProjectProps) {
  const { projectId, csrfToken, editMode } = props;

  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");

  const [project, setProject] = useState<ProjectData | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(editMode);
  const [selectedTab, setSelectedTab] = useState(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "details",
  );
  const [pendingEdit, setPendingEdit] = useState(editMode);

  const router = useRouter();
  const postHog = usePostHog();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { isMobile, isTablet } = useMediaQuery();

  const placeholderLogo = getPlaceholderImageSrc();
  const placeholderBanner = getPlaceholderImageSrc();

  const fetchProject = useCallback(async () => {
    try {
      const url = address
        ? `/api/flow-council/projects/${projectId}?managerAddress=${address}`
        : `/api/flow-council/projects/${projectId}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        const parsedProject = {
          ...data.project,
          details:
            typeof data.project.details === "string"
              ? JSON.parse(data.project.details)
              : data.project.details,
        };
        setProject(parsedProject);
        setIsManager(data.isManager ?? false);
        setError(null);
      } else {
        setError(data.error || "Failed to load project");
      }
    } catch (err) {
      console.error("Failed to fetch project:", err);
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId, address]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(
    () => postHog.stopSessionRecording(),
    [postHog, postHog.decideEndpointWasHit],
  );

  useEffect(() => {
    if (pendingEdit && address && session?.address === address) {
      setShowEditModal(true);
      setPendingEdit(false);
    }
  }, [pendingEdit, session, address]);

  const handleEditClick = () => {
    if (!address && openConnectModal) {
      openConnectModal();
    } else if (connectedChain?.id !== 42220) {
      switchChain({ chainId: 42220 });
    } else if (!session || session.address !== address) {
      handleSignIn(csrfToken);
      setPendingEdit(true);
    } else {
      setShowEditModal(true);
    }
  };

  if (loading) {
    return <Spinner className="m-auto" />;
  }

  if (error || !project) {
    return (
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52 align-items-center justify-content-center"
        style={{ minHeight: "50vh" }}
      >
        <Card.Text className="fs-5 text-muted">
          {error || "Project not found"}
        </Card.Text>
        <Button
          variant="link"
          className="mt-3"
          onClick={() => router.push("/projects")}
        >
          Back to Projects
        </Button>
      </Stack>
    );
  }

  const details = project.details;

  return (
    <>
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
      >
        <Card
          className="position-relative border-0"
          style={{ height: isMobile ? 180 : isTablet ? 340 : 550 }}
        >
          <Card.Img
            variant="top"
            src={details?.bannerUrl || placeholderBanner}
            height={isMobile ? 200 : isTablet ? 300 : 500}
            className="bg-light rounded-0 rounded-4"
          />
          <Image
            src={details?.logoUrl || placeholderLogo}
            alt=""
            width={isMobile || isTablet ? 100 : 200}
            height={isMobile || isTablet ? 100 : 200}
            className="rounded-4 position-absolute border border-2 border-light bg-white"
            style={{
              bottom: isTablet ? -10 : -50,
              left: isMobile ? 30 : 50,
            }}
          />
        </Card>
        <Stack
          direction="horizontal"
          className="justify-content-between mt-18 px-3 sm:px-0"
        >
          <Card.Text className="bg-transparent border-0 m-0 p-0 fs-5 fw-semi-bold">
            {details?.name ?? "N/A"}
          </Card.Text>
          {isManager && (
            <Button
              variant="secondary"
              className="w-20 px-10 py-4 rounded-4 fw-semi-bold"
              onClick={handleEditClick}
            >
              Edit
            </Button>
          )}
        </Stack>
        <Card.Text className="bg-transparent border-0 m-0 px-3 sm:px-0 fs-lg text-info text-truncate">
          {project.managerAddresses?.[0] ?? "N/A"}
        </Card.Text>
        <Stack
          direction="horizontal"
          className="flex-wrap my-2 px-3 sm:px-0"
          style={{ rowGap: 8 }}
        >
          {!!details?.website && (
            <Button
              variant="link"
              href={`https://${details.website}`}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image src="/link.svg" alt="link" width={18} height={18} />
              <Card.Text className="text-truncate">{details.website}</Card.Text>
            </Button>
          )}
          {!!details?.github && (
            <Button
              variant="link"
              href={`https://github.com/${details.github}`}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image src="/github.svg" alt="github" width={18} height={18} />
              <Card.Text className="text-truncate">
                {`github.com/${details.github}`}
              </Card.Text>
            </Button>
          )}
          {!!details?.karmaProfile && (
            <Button
              variant="link"
              href={details.karmaProfile}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image
                src="/karma-gap.svg"
                alt="Karma Gap"
                width={18}
                height={18}
              />
              <Card.Text className="text-truncate">
                {details.karmaProfile}
              </Card.Text>
            </Button>
          )}
          {!!details?.twitter && (
            <Button
              variant="link"
              href={`https://x.com/${details.twitter}`}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image src="/x-logo.svg" alt="x" width={14} height={14} />
              <Card.Text className="text-truncate">
                {`x.com/${details.twitter}`}
              </Card.Text>
            </Button>
          )}
          {!!details?.farcaster && (
            <Button
              variant="link"
              href={`https://farcaster.xyz/${details.farcaster}`}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image
                src="/farcaster.svg"
                alt="farcaster"
                width={16}
                height={16}
              />
              <Card.Text className="text-truncate">
                {`farcaster.xyz/${details.farcaster}`}
              </Card.Text>
            </Button>
          )}
          {!!details?.telegram && (
            <Button
              variant="link"
              href={details.telegram}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image
                src="/telegram.svg"
                alt="telegram"
                width={16}
                height={16}
              />
              <Card.Text className="text-truncate">
                {details.telegram}
              </Card.Text>
            </Button>
          )}
          {!!details?.discord && (
            <Button
              variant="link"
              href={details.discord}
              target="_blank"
              className="d-flex gap-1 align-items-center p-0 text-info text-decoration-none"
              style={{ width: !isMobile ? "33%" : "" }}
            >
              <Image src="/discord.svg" alt="discord" width={16} height={16} />
              <Card.Text className="text-truncate">{details.discord}</Card.Text>
            </Button>
          )}
        </Stack>
        <Tab.Container
          activeKey={selectedTab}
          onSelect={(key) => setSelectedTab(key ?? "details")}
        >
          <Nav className="pt-8 pb-6 fs-6 gap-2 px-3 sm:px-0">
            <Nav.Item>
              <Nav.Link
                eventKey="details"
                className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${selectedTab === "details" ? "bg-primary text-white" : "bg-white text-primary"}`}
                style={{ width: 140 }}
              >
                Details
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                eventKey="feed"
                className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${selectedTab === "feed" ? "bg-primary text-white" : "bg-white text-primary"}`}
                style={{ width: 140 }}
              >
                Feed
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                eventKey="milestones"
                className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${selectedTab === "milestones" ? "bg-primary text-white" : "bg-white text-primary"}`}
                style={{ width: 140 }}
              >
                Milestones
              </Nav.Link>
            </Nav.Item>
          </Nav>
          <Tab.Content>
            <Tab.Pane eventKey="details">
              <Markdown className="px-3 sm:px-0">
                {details?.description}
              </Markdown>
            </Tab.Pane>
            <Tab.Pane eventKey="feed">
              <ProjectFeedTab
                projectId={projectId}
                isManager={isManager}
                csrfToken={csrfToken}
                active={selectedTab === "feed"}
              />
            </Tab.Pane>
            <Tab.Pane eventKey="milestones">
              <ProjectMilestonesTab
                projectId={projectId}
                isManager={isManager}
                csrfToken={csrfToken}
              />
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </Stack>
      {project && isManager && (
        <ProjectModal
          show={showEditModal}
          chainId={42220}
          csrfToken={csrfToken}
          handleClose={() => {
            setShowEditModal(false);
            router.replace(`/projects/${projectId}`);
          }}
          onProjectCreated={fetchProject}
          mode="edit"
          project={project}
        />
      )}
    </>
  );
}
