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
import ViewRoundTab from "@/app/flow-councils/components/ViewRoundTab";
import AttestationTab, {
  type AttestationForm,
} from "@/app/flow-councils/components/AttestationTab";
import ViewAttestationTab from "@/app/flow-councils/components/ViewAttestationTab";
import { networks } from "@/lib/networks";
import { FlowCouncilProject } from "@/app/flow-councils/types/grantee";

type ApplicationProps = {
  chainId: number;
  councilId: string;
  projectId?: string;
  csrfToken: string;
};

export default function Application(props: ApplicationProps) {
  const { chainId, councilId, projectId, csrfToken } = props;

  const router = useRouter();
  const { address } = useAccount();

  const [activeTab, setActiveTab] = useState("project");
  const [project, setProject] = useState<FlowCouncilProject | null>(null);
  const [roundData, setRoundData] = useState<RoundForm | null>(null);
  const [attestationData, setAttestationData] =
    useState<AttestationForm | null>(null);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(!!projectId);

  // Track sequential tab completion - tabs are unlocked when previous tabs are complete
  const [projectComplete, setProjectComplete] = useState(false);
  const [roundComplete, setRoundComplete] = useState(false);

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
            if (details.attestation || details.eligibility) {
              setAttestationData(details.attestation || details.eligibility);
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

  // Set completion status based on existing data
  // If they have existing project data, project tab is complete
  useEffect(() => {
    if (project) {
      setProjectComplete(true);
    }
  }, [project]);

  // If they have existing round data, round tab is complete
  useEffect(() => {
    if (roundData) {
      setRoundComplete(true);
    }
  }, [roundData]);

  const handleBack = () => {
    router.push(`/flow-councils/application/${chainId}/${councilId}`);
  };

  const handleProjectSaved = (projectId: number) => {
    setSavedProjectId(projectId);
    setProjectComplete(true);
    setActiveTab("round");
    window.scrollTo(0, 0);
  };

  const handleRoundSaved = (savedRoundData: RoundForm, appId?: number) => {
    setRoundData(savedRoundData);
    setRoundComplete(true);
    if (appId) {
      setApplicationId(appId);
    }
    setActiveTab("eligibility");
    window.scrollTo(0, 0);
  };

  if (!chainId || !network || !councilId) {
    return <span className="m-auto fs-4 fw-bold">Invalid council</span>;
  }

  return (
    <Stack direction="vertical">
      <Tab.Container
        activeKey={activeTab}
        onSelect={(k) => k && setActiveTab(k)}
      >
        <Nav className="gap-2 mb-4 border-0">
          <Nav.Item>
            <Nav.Link
              eventKey="project"
              className={`py-3 rounded-4 fs-lg fw-bold d-flex justify-content-center align-items-center text-center border border-2 border-primary ${
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
              className={`py-3 rounded-4 fs-lg fw-bold d-flex justify-content-center align-items-center text-center border border-2 border-primary ${
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
              className={`py-3 rounded-4 fs-lg fw-bold d-flex justify-content-center align-items-center text-center border border-2 border-primary ${
                activeTab === "eligibility"
                  ? "bg-primary text-white"
                  : "bg-white text-primary"
              }`}
              style={{ width: 140 }}
            >
              Attestation
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <a
          href="https://docs.google.com/document/d/1AnyrCNnXMJ9LYC_wXTK_Xu6il2duswp_QiM8oeU9iFA/edit?tab=t.0"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary mb-4"
        >
          Application Template
        </a>

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
            {projectComplete ? (
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
            ) : (
              <ViewRoundTab roundData={roundData} />
            )}
          </Tab.Pane>
          <Tab.Pane eventKey="eligibility">
            {roundComplete ? (
              <AttestationTab
                chainId={chainId}
                councilId={councilId}
                projectId={savedProjectId ?? project?.id ?? 0}
                applicationId={applicationId}
                csrfToken={csrfToken}
                defaultFundingAddress={
                  project?.details?.defaultFundingAddress || ""
                }
                existingAttestationData={attestationData}
                existingRoundData={roundData}
                isLoading={isLoading}
                onBack={() => setActiveTab("round")}
              />
            ) : (
              <ViewAttestationTab attestationData={attestationData} />
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </Stack>
  );
}
