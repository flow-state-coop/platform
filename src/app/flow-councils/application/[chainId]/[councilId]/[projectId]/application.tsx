"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import ProjectTab from "@/app/flow-councils/components/ProjectTab";
import RoundTab, {
  type RoundForm,
} from "@/app/flow-councils/components/RoundTab";
import EligibilityTab, {
  type EligibilityForm,
} from "@/app/flow-councils/components/EligibilityTab";
import { networks } from "@/lib/networks";

type ApplicationProps = {
  chainId: number;
  councilId: string;
  projectId?: string;
  csrfToken: string;
};

type ProjectDetails = {
  name: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  github?: string;
  defaultFundingAddress?: string;
  demoUrl?: string;
  farcaster?: string;
  telegram?: string;
  discord?: string;
  karmaProfile?: string;
  githubRepos?: string[];
  smartContracts?: Array<{
    type: "projectAddress" | "goodCollectivePool";
    network: string;
    address: string;
  }>;
  otherLinks?: Array<{
    description: string;
    url: string;
  }>;
};

type Project = {
  id: number;
  details: ProjectDetails | null;
  managerAddresses: string[];
  managerEmails: string[];
};

export default function Application(props: ApplicationProps) {
  const { chainId, councilId, projectId, csrfToken } = props;

  const router = useRouter();
  const { address } = useAccount();

  const [activeTab, setActiveTab] = useState("project");
  const [project, setProject] = useState<Project | null>(null);
  const [roundData, setRoundData] = useState<RoundForm | null>(null);
  const [eligibilityData, setEligibilityData] =
    useState<EligibilityForm | null>(null);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(!!projectId);

  const network = networks.find((n) => n.id === chainId);

  const fetchProject = useCallback(async () => {
    if (!projectId || !address) return;

    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/flow-council/projects/${projectId}?managerAddress=${address}`,
      );
      const data = await res.json();

      if (data.success && data.project) {
        const details =
          typeof data.project.details === "string"
            ? JSON.parse(data.project.details)
            : data.project.details;

        setProject({
          id: data.project.id,
          details,
          managerAddresses: data.project.managerAddresses ?? [],
          managerEmails: data.project.managerEmails ?? [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch project:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, address]);

  const fetchApplication = useCallback(async () => {
    if (!projectId || !address) return;

    try {
      const res = await fetch("/api/flow-council/applications", {
        method: "POST",
        body: JSON.stringify({ chainId, councilId }),
      });
      const data = await res.json();

      if (data.success && data.applications) {
        const app = data.applications.find(
          (a: { projectId: number }) => a.projectId === parseInt(projectId, 10),
        );
        if (app) {
          setApplicationId(app.id);
          if (app.details) {
            const details =
              typeof app.details === "string"
                ? JSON.parse(app.details)
                : app.details;
            setRoundData(details);
            if (details.eligibility) {
              setEligibilityData(details.eligibility);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch application:", err);
    }
  }, [projectId, address, chainId, councilId]);

  useEffect(() => {
    if (projectId && address) {
      fetchProject();
      fetchApplication();
    }
  }, [fetchProject, fetchApplication, projectId, address]);

  const handleBack = () => {
    router.push(`/flow-councils/application/${chainId}/${councilId}`);
  };

  const handleProjectSaved = (projectId: number) => {
    setSavedProjectId(projectId);
    setActiveTab("round");
  };

  const handleRoundSaved = (appId?: number) => {
    if (appId) {
      setApplicationId(appId);
    }
    setActiveTab("eligibility");
  };

  const handleEligibilitySubmit = () => {
    router.push(`/flow-councils/application/${chainId}/${councilId}`);
  };

  if (!chainId || !network || !councilId) {
    return <span className="m-auto fs-4 fw-bold">Invalid council</span>;
  }

  return (
    <Stack direction="vertical" className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52">
      <Tab.Container
        activeKey={activeTab}
        onSelect={(k) => k && setActiveTab(k)}
      >
        <Nav className="gap-2 mb-4 border-0">
          <Nav.Item>
            <Nav.Link
              eventKey="project"
              className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                activeTab === "project"
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
              disabled={!savedProjectId && !project}
              className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                activeTab === "round"
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
              disabled={!roundData && !applicationId}
              className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                activeTab === "eligibility"
                  ? "bg-primary text-white"
                  : "bg-white text-primary"
              }`}
              style={{ width: 140 }}
            >
              Eligibility
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey="project">
            <ProjectTab
              chainId={chainId}
              csrfToken={csrfToken}
              project={project}
              isLoading={isLoading}
              onSave={handleProjectSaved}
              onCancel={handleBack}
            />
          </Tab.Pane>
          <Tab.Pane eventKey="round">
            <RoundTab
              chainId={chainId}
              councilId={councilId}
              projectId={savedProjectId ?? project?.id ?? 0}
              csrfToken={csrfToken}
              existingRoundData={roundData}
              isLoading={isLoading}
              onSave={handleRoundSaved}
              onBack={() => setActiveTab("project")}
            />
          </Tab.Pane>
          <Tab.Pane eventKey="eligibility">
            <EligibilityTab
              chainId={chainId}
              councilId={councilId}
              projectId={savedProjectId ?? project?.id ?? 0}
              applicationId={applicationId}
              csrfToken={csrfToken}
              defaultFundingAddress={
                project?.details?.defaultFundingAddress || ""
              }
              existingEligibilityData={eligibilityData}
              existingRoundData={roundData}
              isLoading={isLoading}
              onSubmit={handleEligibilitySubmit}
              onBack={() => setActiveTab("round")}
            />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </Stack>
  );
}
