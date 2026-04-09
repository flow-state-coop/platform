"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import ProjectTab from "@/app/flow-councils/components/ProjectTab";
import RoundTab from "@/app/flow-councils/components/RoundTab";
import ViewRoundTab from "@/app/flow-councils/components/ViewRoundTab";
import AttestationTab from "@/app/flow-councils/components/AttestationTab";
import ViewAttestationTab from "@/app/flow-councils/components/ViewAttestationTab";
import DynamicFormSection from "@/app/flow-councils/components/DynamicFormSection";
import FundingAddressSection from "@/app/flow-councils/components/FundingAddressSection";
import type {
  RoundForm,
  AttestationForm,
} from "@/app/flow-councils/types/round";
import type { FormSchema } from "@/app/flow-councils/types/formSchema";
import { generateApplicationTemplate } from "@/app/flow-councils/lib/generateApplicationTemplate";
import { networks } from "@/lib/networks";
import { Project } from "@/types/project";
import useRequireAuth from "@/hooks/requireAuth";

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
  const { hasSession, requireAuth } = useRequireAuth();

  const [activeTab, setActiveTab] = useState("project");
  const [project, setProject] = useState<Project | null>(null);
  const [roundData, setRoundData] = useState<RoundForm | null>(null);
  const [attestationData, setAttestationData] =
    useState<AttestationForm | null>(null);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(
    null,
  );
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);
  const [editsUnlocked, setEditsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(!!projectId);

  const [projectComplete, setProjectComplete] = useState(false);
  const [roundComplete, setRoundComplete] = useState(false);

  // Dynamic form schema
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [dynamicRoundValues, setDynamicRoundValues] = useState<
    Record<string, unknown>
  >({});
  const [dynamicAttestationValues, setDynamicAttestationValues] = useState<
    Record<string, unknown>
  >({});
  const [dynamicFundingAddress, setDynamicFundingAddress] = useState("");
  const [dynamicValidated, setDynamicValidated] = useState(false);
  const [dynamicSaving, setDynamicSaving] = useState(false);
  const [dynamicError, setDynamicError] = useState("");

  // Round name for template download
  const [roundName, setRoundName] = useState<string>("");

  // Profile data for auto-fill
  const [profileData, setProfileData] = useState<{
    displayName?: string;
    email?: string;
    telegram?: string;
  }>({});

  const LOCKED_STATUSES = ["ACCEPTED", "REJECTED", "GRADUATED", "REMOVED"];
  const isInLockedStatus =
    applicationStatus !== null && LOCKED_STATUSES.includes(applicationStatus);
  const isApplicationLocked = isInLockedStatus && !editsUnlocked;

  const network = networks.find((n) => n.id === chainId);

  // Fetch round (returns both name and form schema in details)
  const fetchFormSchema = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
      );
      const roundData = await res.json();
      if (roundData.success && roundData.round?.details) {
        const details =
          typeof roundData.round.details === "string"
            ? JSON.parse(roundData.round.details)
            : roundData.round.details;
        setRoundName(details?.name ?? "");
        if (details?.formSchema) {
          setFormSchema(details.formSchema);
        }
      }
    } catch (err) {
      console.error("Failed to fetch form schema:", err);
    }
  }, [chainId, councilId]);

  // Fetch user profile for auto-fill
  const fetchProfile = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(
        `/api/flow-council/profile?address=${encodeURIComponent(address)}&includePrivate=true`,
      );
      const data = await res.json();
      if (data.success && data.profile) {
        setProfileData({
          displayName: data.profile.displayName ?? undefined,
          email: data.profile.email ?? undefined,
          telegram: data.profile.telegram ?? undefined,
        });
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    }
  }, [address]);

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
          setApplicationStatus(app.status);
          setEditsUnlocked(app.editsUnlocked ?? false);
          if (app.details) {
            const details =
              typeof app.details === "string"
                ? JSON.parse(app.details)
                : app.details;

            if (details._formVersion === 1) {
              // Dynamic form data
              setDynamicRoundValues(details.round ?? {});
              setDynamicAttestationValues(details.attestation ?? {});
              if (app.fundingAddress) {
                setDynamicFundingAddress(app.fundingAddress);
              }
            } else {
              // Legacy data
              setRoundData(details);
              if (details.attestation || details.eligibility) {
                setAttestationData(details.attestation || details.eligibility);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch application:", err);
    }
  }, [projectId, address, chainId, councilId]);

  useEffect(() => {
    fetchFormSchema();
    fetchProfile();
  }, [fetchFormSchema, fetchProfile]);

  useEffect(() => {
    if (projectId && address) {
      fetchProject();
      fetchApplication();
    }
  }, [fetchProject, fetchApplication, projectId, address]);

  useEffect(() => {
    if (project) {
      setProjectComplete(true);
    }
  }, [project]);

  useEffect(() => {
    if (roundData) {
      setRoundComplete(true);
    }
  }, [roundData]);

  const showNudge = !profileData.displayName || !profileData.email;

  const handleDynamicRoundChange = useCallback((id: string, value: unknown) => {
    setDynamicRoundValues((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleDynamicAttestationChange = useCallback(
    (id: string, value: unknown) => {
      setDynamicAttestationValues((prev) => ({ ...prev, [id]: value }));
    },
    [],
  );

  const handleBack = () => {
    router.push(`/flow-councils/application/${chainId}/${councilId}`);
  };

  const handleProjectSaved = (savedProject: Project) => {
    setSavedProjectId(savedProject.id);
    setProject(savedProject);
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

  // Dynamic form: save round data
  const handleDynamicRoundSave = async () => {
    setDynamicValidated(true);
    setDynamicError("");
    setDynamicSaving(true);

    try {
      const res = await fetch("/api/flow-council/applications", {
        method: "PUT",
        body: JSON.stringify({
          projectId: savedProjectId ?? project?.id,
          chainId,
          councilId,
          details: {
            _formVersion: 1,
            round: dynamicRoundValues,
            attestation: dynamicAttestationValues,
          },
          fundingAddress: dynamicFundingAddress,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        setDynamicError(json.error || "Failed to save");
        setDynamicSaving(false);
        return;
      }

      if (json.application?.id) {
        setApplicationId(json.application.id);
      }
      setRoundComplete(true);
      setDynamicSaving(false);
      setActiveTab("eligibility");
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      setDynamicError("Failed to save");
      setDynamicSaving(false);
    }
  };

  // Dynamic form: submit attestation
  const handleDynamicAttestationSubmit = async () => {
    if (!applicationId) return;
    setDynamicValidated(true);
    setDynamicError("");
    setDynamicSaving(true);

    try {
      const res = await fetch(
        `/api/flow-council/applications/${applicationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            details: {
              _formVersion: 1,
              round: dynamicRoundValues,
              attestation: dynamicAttestationValues,
            },
            fundingAddress: dynamicFundingAddress,
            submit: true,
          }),
        },
      );
      const json = await res.json();

      if (!json.success) {
        setDynamicError(json.error || "Failed to submit");
        setDynamicSaving(false);
        return;
      }

      setDynamicSaving(false);
      router.push(`/flow-councils/application/${chainId}/${councilId}`);
    } catch (err) {
      console.error(err);
      setDynamicError("Failed to submit");
      setDynamicSaving(false);
    }
  };

  if (!chainId || !network || !councilId) {
    return <span className="m-auto fs-4 fw-bold">Invalid council</span>;
  }

  return (
    <Stack direction="vertical">
      {showNudge && (
        <Alert
          variant="warning"
          className="mb-3 border border-2 border-warning d-flex align-items-center"
        >
          <div>
            Complete your profile (display name &amp; email) to auto-fill
            contact info across applications.{" "}
            <Link href="/profile" target="_blank">
              Go to profile
            </Link>
          </div>
        </Alert>
      )}

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

        {formSchema && (
          <div className="text-start mb-4">
            <Button
              variant="link"
              className="text-primary p-0 text-decoration-underline"
              onClick={() => {
                const { content, filename } = generateApplicationTemplate(
                  formSchema,
                  roundName,
                );
                const blob = new Blob([content], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download Application Template
            </Button>
          </div>
        )}

        <Tab.Content>
          <Tab.Pane eventKey="project">
            <ProjectTab
              csrfToken={csrfToken}
              project={project}
              isLoading={isLoading}
              onSave={handleProjectSaved}
              onCancel={handleBack}
            />
          </Tab.Pane>
          <Tab.Pane eventKey="round">
            {projectComplete && !isApplicationLocked ? (
              formSchema ? (
                // Dynamic form mode
                <>
                  <FundingAddressSection
                    value={dynamicFundingAddress}
                    onChange={setDynamicFundingAddress}
                    defaultFundingAddress={
                      project?.details?.defaultFundingAddress || ""
                    }
                    locked={isInLockedStatus && editsUnlocked}
                    validated={dynamicValidated}
                  />
                  <DynamicFormSection
                    elements={formSchema.round}
                    values={dynamicRoundValues}
                    onChange={handleDynamicRoundChange}
                    validated={dynamicValidated}
                    profileData={profileData}
                  />
                  {dynamicError && (
                    <p className="text-danger fw-semi-bold">{dynamicError}</p>
                  )}
                  <Stack direction="horizontal" gap={3} className="mb-30">
                    <Button
                      variant="secondary"
                      className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
                      style={{
                        backgroundColor: "#45ad57",
                        borderColor: "#45ad57",
                      }}
                      onClick={() => setActiveTab("project")}
                    >
                      Back
                    </Button>
                    {!hasSession ? (
                      <Button
                        className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
                        onClick={() => requireAuth(handleDynamicRoundSave)}
                      >
                        Sign In With Ethereum
                      </Button>
                    ) : (
                      <Button
                        className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
                        style={{ minWidth: 120 }}
                        onClick={() => requireAuth(handleDynamicRoundSave)}
                        disabled={dynamicSaving}
                      >
                        {dynamicSaving ? <Spinner size="sm" /> : "Next"}
                      </Button>
                    )}
                  </Stack>
                </>
              ) : (
                // Legacy mode
                <RoundTab
                  chainId={chainId}
                  councilId={councilId}
                  projectId={savedProjectId ?? project?.id ?? 0}
                  existingRoundData={roundData}
                  isLoading={isLoading}
                  onSave={handleRoundSaved}
                  onBack={() => setActiveTab("project")}
                />
              )
            ) : formSchema ? (
              <DynamicFormSection
                elements={formSchema.round}
                values={dynamicRoundValues}
                readOnly
              />
            ) : (
              <ViewRoundTab roundData={roundData} />
            )}
          </Tab.Pane>
          <Tab.Pane eventKey="eligibility">
            {roundComplete && !isApplicationLocked ? (
              formSchema ? (
                // Dynamic form mode
                <>
                  <DynamicFormSection
                    elements={formSchema.attestation}
                    values={dynamicAttestationValues}
                    onChange={handleDynamicAttestationChange}
                    validated={dynamicValidated}
                    profileData={profileData}
                  />
                  {dynamicError && (
                    <p className="text-danger fw-semi-bold">{dynamicError}</p>
                  )}
                  <Stack direction="horizontal" gap={3} className="mb-30">
                    <Button
                      variant="secondary"
                      className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
                      style={{
                        backgroundColor: "#45ad57",
                        borderColor: "#45ad57",
                      }}
                      onClick={() => setActiveTab("round")}
                    >
                      Back
                    </Button>
                    {!hasSession ? (
                      <Button
                        className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
                        onClick={() =>
                          requireAuth(handleDynamicAttestationSubmit)
                        }
                      >
                        Sign In With Ethereum
                      </Button>
                    ) : (
                      <Button
                        className="fs-lg fw-semi-bold rounded-4 py-4"
                        style={{ width: 140 }}
                        onClick={() =>
                          requireAuth(handleDynamicAttestationSubmit)
                        }
                        disabled={dynamicSaving}
                      >
                        {dynamicSaving ? <Spinner size="sm" /> : "Submit"}
                      </Button>
                    )}
                  </Stack>
                </>
              ) : (
                // Legacy mode
                <AttestationTab
                  chainId={chainId}
                  councilId={councilId}
                  projectId={savedProjectId ?? project?.id ?? 0}
                  applicationId={applicationId}
                  defaultFundingAddress={
                    project?.details?.defaultFundingAddress || ""
                  }
                  existingAttestationData={attestationData}
                  existingRoundData={roundData}
                  isLoading={isLoading}
                  onBack={() => setActiveTab("round")}
                  fundingWalletLocked={isInLockedStatus && editsUnlocked}
                  saveOnly={isInLockedStatus && editsUnlocked}
                />
              )
            ) : formSchema ? (
              <DynamicFormSection
                elements={formSchema.attestation}
                values={dynamicAttestationValues}
                readOnly
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
