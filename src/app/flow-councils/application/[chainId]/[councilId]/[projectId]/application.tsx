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
import { getApplicationAsDynamic } from "@/app/flow-councils/utils/legacyFormAdapter";
import { generateApplicationTemplate } from "@/app/flow-councils/lib/generateApplicationTemplate";
import { networks } from "@/lib/networks";
import { Project } from "@/types/project";
import useRequireAuth from "@/hooks/requireAuth";

function FormSkeleton() {
  return (
    <div className="placeholder-glow">
      <span
        className="placeholder rounded bg-secondary d-block mb-4"
        style={{ width: 200, height: 28 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-2"
        style={{ width: 160, height: 18 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-4"
        style={{ height: 46 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-2"
        style={{ width: 140, height: 18 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-4"
        style={{ height: 46 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-2"
        style={{ width: 180, height: 18 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-4"
        style={{ height: 100 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mt-5 mb-4"
        style={{ width: 200, height: 28 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-2"
        style={{ width: 120, height: 18 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-4"
        style={{ height: 46 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block mb-2"
        style={{ width: 150, height: 18 }}
      />
      <span
        className="placeholder rounded bg-secondary d-block"
        style={{ height: 46 }}
      />
    </div>
  );
}

type ApplicationProps = {
  chainId: number;
  councilId: string;
  projectId?: string;
  csrfToken: string;
};

const FORM_VERSION = 1;
const LOCKED_STATUSES = ["ACCEPTED", "REJECTED", "GRADUATED", "REMOVED"];
const TABS = [
  { key: "project", label: "Project" },
  { key: "round", label: "Round" },
  { key: "eligibility", label: "Attestation" },
] as const;

function parseRoundDetails(round: { details: unknown }): {
  name: string;
  formSchema: FormSchema | null;
} {
  const details =
    typeof round.details === "string"
      ? JSON.parse(round.details)
      : round.details;
  return {
    name: details?.name ?? "",
    formSchema: details?.formSchema ?? null,
  };
}

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

  const [roundName, setRoundName] = useState<string>("");

  const [profileData, setProfileData] = useState<{
    displayName?: string;
    email?: string;
    telegram?: string;
  }>({});

  const projectComplete = !!project;
  const roundComplete = !!applicationId;
  const isDynamicFormApp = formSchema != null;

  const isInLockedStatus =
    applicationStatus !== null && LOCKED_STATUSES.includes(applicationStatus);
  const isApplicationLocked = isInLockedStatus && !editsUnlocked;

  const network = networks.find((n) => n.id === chainId);

  const fetchRound = useCallback(async (): Promise<FormSchema | null> => {
    try {
      const res = await fetch(
        `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
      );
      const data = await res.json();
      if (!data.success || !data.round?.details) return null;
      const { name, formSchema: schema } = parseRoundDetails(data.round);
      setRoundName(name);
      if (schema) setFormSchema(schema);
      return schema;
    } catch (err) {
      console.error("Failed to fetch form schema:", err);
      return null;
    }
  }, [chainId, councilId]);

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
    }
  }, [projectId, address]);

  const fetchApplication = useCallback(
    async (schema: FormSchema | null) => {
      if (!projectId || !address) return;

      try {
        const res = await fetch("/api/flow-council/applications", {
          method: "POST",
          body: JSON.stringify({ chainId, councilId }),
        });
        const data = await res.json();

        if (!data.success || !data.applications) return;
        const app = data.applications.find(
          (a: { projectId: number }) => a.projectId === parseInt(projectId, 10),
        );
        if (!app) return;

        setApplicationId(app.id);
        setApplicationStatus(app.status);
        setEditsUnlocked(app.editsUnlocked ?? false);
        if (!app.details) return;

        const details =
          typeof app.details === "string"
            ? JSON.parse(app.details)
            : app.details;

        if (schema) {
          setDynamicRoundValues(
            (details.round as Record<string, unknown>) ?? {},
          );
          setDynamicAttestationValues(
            (details.attestation as Record<string, unknown>) ?? {},
          );
          if (app.fundingAddress) {
            setDynamicFundingAddress(app.fundingAddress);
          }
        } else {
          setRoundData(details as unknown as RoundForm);
          const attestation = details.attestation ?? details.eligibility;
          if (attestation) {
            setAttestationData(attestation as AttestationForm);
          }
        }
      } catch (err) {
        console.error("Failed to fetch application:", err);
      }
    },
    [projectId, address, chainId, councilId],
  );

  useEffect(() => {
    if (projectId && address) {
      setIsLoading(true);
      (async () => {
        const schema = await fetchRound();
        await Promise.all([
          fetchProfile(),
          fetchProject(),
          fetchApplication(schema),
        ]);
        setIsLoading(false);
      })();
    } else {
      fetchRound();
      fetchProfile();
    }
  }, [
    fetchRound,
    fetchProfile,
    fetchProject,
    fetchApplication,
    projectId,
    address,
  ]);

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
    setActiveTab("round");
    window.scrollTo(0, 0);
  };

  const handleRoundSaved = (savedRoundData: RoundForm, appId?: number) => {
    setRoundData(savedRoundData);
    if (appId) {
      setApplicationId(appId);
    }
    setActiveTab("eligibility");
    window.scrollTo(0, 0);
  };

  const handleDynamicRoundSave = async () => {
    setDynamicValidated(true);
    setDynamicError("");
    setDynamicSaving(true);

    try {
      const res = await fetch("/api/flow-council/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: savedProjectId ?? project?.id,
          chainId,
          councilId,
          details: {
            _formVersion: FORM_VERSION,
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
      setDynamicSaving(false);
      setActiveTab("eligibility");
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      setDynamicError("Failed to save");
      setDynamicSaving(false);
    }
  };

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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            details: {
              _formVersion: FORM_VERSION,
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

  const legacyView = getApplicationAsDynamic(
    roundData || attestationData
      ? { ...(roundData ?? {}), attestation: attestationData ?? undefined }
      : null,
    null,
  );

  if (!chainId || !network || !councilId) {
    return <span className="m-auto fs-4 fw-bold">Invalid council</span>;
  }

  if (isLoading) {
    return (
      <Stack direction="vertical">
        <Nav className="gap-2 mb-4 border-0">
          {["Project", "Round", "Attestation"].map((label) => (
            <Nav.Item key={label}>
              <span
                className="d-block py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary bg-white text-primary"
                style={{ width: 140 }}
              >
                {label}
              </span>
            </Nav.Item>
          ))}
        </Nav>
        <FormSkeleton />
      </Stack>
    );
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
          {TABS.map(({ key, label }) => (
            <Nav.Item key={key}>
              <Nav.Link
                eventKey={key}
                className={`py-3 rounded-4 fs-lg fw-bold d-flex justify-content-center align-items-center text-center border border-2 border-primary ${
                  activeTab === key
                    ? "bg-primary text-white"
                    : "bg-white text-primary"
                }`}
                style={{ width: 140 }}
              >
                {label}
              </Nav.Link>
            </Nav.Item>
          ))}
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
                setTimeout(() => URL.revokeObjectURL(url), 0);
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
              ) : isDynamicFormApp ? (
                <FormSkeleton />
              ) : (
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
              <>
                <FundingAddressSection
                  value={dynamicFundingAddress}
                  onChange={setDynamicFundingAddress}
                  defaultFundingAddress=""
                  locked
                  validated={false}
                />
                <DynamicFormSection
                  elements={formSchema.round}
                  values={dynamicRoundValues}
                  readOnly
                />
              </>
            ) : isDynamicFormApp ? (
              <FormSkeleton />
            ) : (
              <ViewRoundTab
                formSchema={legacyView.schema}
                dynamicValues={legacyView.roundValues}
              />
            )}
          </Tab.Pane>
          <Tab.Pane eventKey="eligibility">
            {roundComplete && !isApplicationLocked ? (
              formSchema ? (
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
              ) : isDynamicFormApp ? (
                <FormSkeleton />
              ) : (
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
            ) : isDynamicFormApp ? (
              <FormSkeleton />
            ) : (
              <ViewAttestationTab
                formSchema={legacyView.schema}
                dynamicValues={legacyView.attestationValues}
              />
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </Stack>
  );
}
