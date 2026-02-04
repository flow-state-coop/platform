"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import Spinner from "react-bootstrap/Spinner";
import MilestoneInput, {
  type BuildMilestone,
  type GrowthMilestone,
} from "./MilestoneInput";
import TeamMemberInput, { type TeamMember } from "./TeamMemberInput";
import InfoBox from "./InfoBox";
import CharacterCounter from "./CharacterCounter";
import { CHARACTER_LIMITS } from "../constants";
import useSiwe from "@/hooks/siwe";

export type IntegrationType =
  | "payments"
  | "identity"
  | "claimFlow"
  | "goodCollective"
  | "supertoken"
  | "activityFees"
  | "other";

export type RoundForm = {
  previousParticipation: {
    hasParticipatedBefore: boolean | null;
    numberOfRounds: string;
    previousKarmaUpdates: string;
    currentProjectState: string;
  };
  maturityAndUsage: {
    projectStage: "early" | "live" | "mature" | null;
    lifetimeUsers: string;
    activeUsers: string;
    activeUsersFrequency: "daily" | "weekly" | "monthly";
    otherUsageData: string;
  };
  integration: {
    status: "live" | "ready" | "planned" | null;
    types: IntegrationType[];
    otherTypeExplanation: string;
    description: string;
  };
  buildGoals: {
    primaryBuildGoal: string;
    milestones: BuildMilestone[];
    ecosystemImpact: string;
  };
  growthGoals: {
    primaryGrowthGoal: string;
    targetUsers: string;
    milestones: GrowthMilestone[];
    ecosystemImpact: string;
  };
  team: {
    primaryContact: TeamMember;
    additionalTeammates: TeamMember[];
  };
  additional: {
    comments: string;
  };
};

const initialForm: RoundForm = {
  previousParticipation: {
    hasParticipatedBefore: null,
    numberOfRounds: "",
    previousKarmaUpdates: "",
    currentProjectState: "",
  },
  maturityAndUsage: {
    projectStage: null,
    lifetimeUsers: "",
    activeUsers: "",
    activeUsersFrequency: "weekly",
    otherUsageData: "",
  },
  integration: {
    status: null,
    types: [],
    otherTypeExplanation: "",
    description: "",
  },
  buildGoals: {
    primaryBuildGoal: "",
    milestones: [{ title: "", description: "", deliverables: [""] }],
    ecosystemImpact: "",
  },
  growthGoals: {
    primaryGrowthGoal: "",
    targetUsers: "",
    milestones: [{ title: "", description: "", activations: [""] }],
    ecosystemImpact: "",
  },
  team: {
    primaryContact: {
      name: "",
      roleDescription: "",
      telegram: "",
      githubOrLinkedin: "",
    },
    additionalTeammates: [],
  },
  additional: {
    comments: "",
  },
};

const INTEGRATION_TYPE_OPTIONS: { value: IntegrationType; label: string }[] = [
  { value: "payments", label: "Payments/rewards using G$" },
  { value: "identity", label: "Identity" },
  { value: "claimFlow", label: "Claim flow" },
  { value: "goodCollective", label: "GoodCollective pools" },
  { value: "supertoken", label: "G$ Supertoken/streaming" },
  { value: "activityFees", label: "Activity fees --> UBI Pool" },
  { value: "other", label: "Other" },
];

const ACTIVE_USERS_FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily Active Users" },
  { value: "weekly", label: "Weekly Active Users" },
  { value: "monthly", label: "Monthly Active Users" },
];

type RoundTabProps = {
  chainId: number;
  councilId: string;
  projectId: number;
  csrfToken: string;
  existingRoundData: RoundForm | null;
  isLoading: boolean;
  onSave: (roundData: RoundForm, applicationId?: number) => void;
  onBack: () => void;
};

export default function RoundTab(props: RoundTabProps) {
  const {
    chainId,
    councilId,
    projectId,
    csrfToken,
    existingRoundData,
    isLoading,
    onSave,
    onBack,
  } = props;

  const [form, setForm] = useState<RoundForm>(initialForm);
  const [validated, setValidated] = useState(false);
  const [touched, setTouched] = useState({
    currentProjectState: false,
    buildEcosystemImpact: false,
    growthEcosystemImpact: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();

  useEffect(() => {
    if (existingRoundData) {
      setForm(existingRoundData);
    }
  }, [existingRoundData]);

  // Validation
  const isCurrentProjectStateValid =
    !form.previousParticipation.hasParticipatedBefore ||
    (form.previousParticipation.currentProjectState.length >=
      CHARACTER_LIMITS.currentProjectState.min &&
      form.previousParticipation.currentProjectState.length <=
        CHARACTER_LIMITS.currentProjectState.max);

  const isPreviousParticipationValid =
    form.previousParticipation.hasParticipatedBefore !== null &&
    isCurrentProjectStateValid;

  const isMaturityValid =
    form.maturityAndUsage.projectStage !== null &&
    form.maturityAndUsage.lifetimeUsers !== "" &&
    form.maturityAndUsage.activeUsers !== "";

  const isIntegrationValid =
    form.integration.status !== null &&
    form.integration.types.length > 0 &&
    form.integration.description.trim() !== "" &&
    (!form.integration.types.includes("other") ||
      form.integration.otherTypeExplanation.trim() !== "");

  const isBuildValid =
    form.buildGoals.primaryBuildGoal.trim() !== "" &&
    form.buildGoals.milestones.length >= 1 &&
    form.buildGoals.milestones.every(
      (m) =>
        m.title.trim() !== "" &&
        m.description.trim() !== "" &&
        m.description.length >= CHARACTER_LIMITS.milestoneDescription.min &&
        m.description.length <= CHARACTER_LIMITS.milestoneDescription.max &&
        m.deliverables.some((d) => d.trim() !== ""),
    ) &&
    form.buildGoals.ecosystemImpact.length <=
      CHARACTER_LIMITS.ecosystemImpact.max;

  const isGrowthValid =
    form.growthGoals.primaryGrowthGoal.trim() !== "" &&
    form.growthGoals.targetUsers.trim() !== "" &&
    form.growthGoals.milestones.length >= 1 &&
    form.growthGoals.milestones.every(
      (m) =>
        m.title.trim() !== "" &&
        m.description.trim() !== "" &&
        m.description.length >= CHARACTER_LIMITS.milestoneDescription.min &&
        m.description.length <= CHARACTER_LIMITS.milestoneDescription.max &&
        m.activations.some((a) => a.trim() !== ""),
    ) &&
    form.growthGoals.ecosystemImpact.length <=
      CHARACTER_LIMITS.ecosystemImpact.max;

  const isTeamValid =
    form.team.primaryContact.name.trim() !== "" &&
    form.team.primaryContact.roleDescription.trim() !== "";

  const isValid =
    isPreviousParticipationValid &&
    isMaturityValid &&
    isIntegrationValid &&
    isBuildValid &&
    isGrowthValid &&
    isTeamValid;

  // Handlers
  const handleIntegrationTypeChange = (
    type: IntegrationType,
    checked: boolean,
  ) => {
    const newTypes = checked
      ? [...form.integration.types, type]
      : form.integration.types.filter((t) => t !== type);
    setForm({
      ...form,
      integration: { ...form.integration, types: newTypes },
    });
  };

  const handleAddBuildMilestone = () => {
    setForm({
      ...form,
      buildGoals: {
        ...form.buildGoals,
        milestones: [
          ...form.buildGoals.milestones,
          { title: "", description: "", deliverables: [""] },
        ],
      },
    });
  };

  const handleRemoveBuildMilestone = (index: number) => {
    const newMilestones = form.buildGoals.milestones.filter(
      (_, i) => i !== index,
    );
    setForm({
      ...form,
      buildGoals: {
        ...form.buildGoals,
        milestones:
          newMilestones.length > 0
            ? newMilestones
            : [{ title: "", description: "", deliverables: [""] }],
      },
    });
  };

  const handleUpdateBuildMilestone = (
    index: number,
    milestone: BuildMilestone,
  ) => {
    const newMilestones = [...form.buildGoals.milestones];
    newMilestones[index] = milestone;
    setForm({
      ...form,
      buildGoals: { ...form.buildGoals, milestones: newMilestones },
    });
  };

  const handleAddGrowthMilestone = () => {
    setForm({
      ...form,
      growthGoals: {
        ...form.growthGoals,
        milestones: [
          ...form.growthGoals.milestones,
          { title: "", description: "", activations: [""] },
        ],
      },
    });
  };

  const handleRemoveGrowthMilestone = (index: number) => {
    const newMilestones = form.growthGoals.milestones.filter(
      (_, i) => i !== index,
    );
    setForm({
      ...form,
      growthGoals: {
        ...form.growthGoals,
        milestones:
          newMilestones.length > 0
            ? newMilestones
            : [{ title: "", description: "", activations: [""] }],
      },
    });
  };

  const handleUpdateGrowthMilestone = (
    index: number,
    milestone: GrowthMilestone,
  ) => {
    const newMilestones = [...form.growthGoals.milestones];
    newMilestones[index] = milestone as GrowthMilestone;
    setForm({
      ...form,
      growthGoals: { ...form.growthGoals, milestones: newMilestones },
    });
  };

  const handleAddTeammate = () => {
    setForm({
      ...form,
      team: {
        ...form.team,
        additionalTeammates: [
          ...form.team.additionalTeammates,
          { name: "", roleDescription: "", telegram: "", githubOrLinkedin: "" },
        ],
      },
    });
  };

  const handleRemoveTeammate = (index: number) => {
    setForm({
      ...form,
      team: {
        ...form.team,
        additionalTeammates: form.team.additionalTeammates.filter(
          (_, i) => i !== index,
        ),
      },
    });
  };

  const handleUpdateTeammate = (index: number, member: TeamMember) => {
    const newTeammates = [...form.team.additionalTeammates];
    newTeammates[index] = member;
    setForm({
      ...form,
      team: { ...form.team, additionalTeammates: newTeammates },
    });
  };

  const handleSaveRound = async () => {
    if (!session?.address) throw Error("Account is not signed in");

    try {
      setIsSubmitting(true);
      setError("");

      const res = await fetch("/api/flow-council/applications", {
        method: "PUT",
        body: JSON.stringify({
          projectId,
          chainId,
          councilId,
          details: form,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Failed to save round data");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSave(form, json.application?.id);
    } catch (err) {
      console.error(err);
      setError("Failed to save round data");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    setValidated(true);
    if (!address && openConnectModal) {
      openConnectModal();
    } else if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
    } else if (!session || session.address !== address) {
      handleSignIn(csrfToken);
    } else if (isValid) {
      handleSaveRound();
    }
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  return (
    <Form>
      {/* Section 1: Previous Participation */}
      <h4 className="fw-bold mb-4">1. Previous Participation</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold mb-1">
          Have you participated in GoodBuilders before?*
        </Form.Label>
        <p className="text-muted small mb-2">
          If not, you can skip the rest of this section.
        </p>
        <Stack direction="horizontal" gap={4}>
          <Form.Check
            type="radio"
            id="participated-yes"
            name="participated"
            label="Yes"
            checked={form.previousParticipation.hasParticipatedBefore === true}
            isInvalid={
              validated &&
              form.previousParticipation.hasParticipatedBefore === null
            }
            onChange={() =>
              setForm({
                ...form,
                previousParticipation: {
                  ...form.previousParticipation,
                  hasParticipatedBefore: true,
                },
              })
            }
          />
          <Form.Check
            type="radio"
            id="participated-no"
            name="participated"
            label="No"
            checked={form.previousParticipation.hasParticipatedBefore === false}
            isInvalid={
              validated &&
              form.previousParticipation.hasParticipatedBefore === null
            }
            onChange={() =>
              setForm({
                ...form,
                previousParticipation: {
                  ...form.previousParticipation,
                  hasParticipatedBefore: false,
                },
              })
            }
          />
        </Stack>
      </Form.Group>

      {form.previousParticipation.hasParticipatedBefore === true && (
        <>
          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold">Number of Rounds</Form.Label>
            <Form.Control
              type="number"
              value={form.previousParticipation.numberOfRounds}
              placeholder=""
              className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
              style={{ maxWidth: 200 }}
              onChange={(e) =>
                setForm({
                  ...form,
                  previousParticipation: {
                    ...form.previousParticipation,
                    numberOfRounds: e.target.value,
                  },
                })
              }
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold">
              Previous Karma Updates
            </Form.Label>
            <Form.Control
              type="text"
              value={form.previousParticipation.previousKarmaUpdates}
              placeholder="https://karmahq.xyz/project/..."
              className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
              onChange={(e) =>
                setForm({
                  ...form,
                  previousParticipation: {
                    ...form.previousParticipation,
                    previousKarmaUpdates: e.target.value,
                  },
                })
              }
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold mb-1">
              What&apos;s the current state of your project today?*
            </Form.Label>
            <ul className="text-muted small mb-2 ps-3">
              <li>Progress made & milestones completed since last round</li>
              <li>Acknowledge blockers and what didn&apos;t work last round</li>
              <li>What else you&apos;ve been up to</li>
            </ul>
            <Form.Control
              as="textarea"
              rows={6}
              value={form.previousParticipation.currentProjectState}
              placeholder=""
              className={`bg-white border border-2 rounded-2 py-3 px-3 ${(validated || touched.currentProjectState) && form.previousParticipation.hasParticipatedBefore && !isCurrentProjectStateValid ? "border-danger" : "border-dark"}`}
              style={{ resize: "vertical", backgroundImage: "none" }}
              isInvalid={
                (validated || touched.currentProjectState) &&
                form.previousParticipation.hasParticipatedBefore === true &&
                !isCurrentProjectStateValid
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  previousParticipation: {
                    ...form.previousParticipation,
                    currentProjectState: e.target.value,
                  },
                })
              }
              onBlur={() =>
                setTouched((prev) => ({ ...prev, currentProjectState: true }))
              }
            />
            <CharacterCounter
              value={form.previousParticipation.currentProjectState}
              min={CHARACTER_LIMITS.currentProjectState.min}
              max={CHARACTER_LIMITS.currentProjectState.max}
            />
          </Form.Group>
        </>
      )}

      {/* Section 2: Maturity & Usage */}
      <h4 className="fw-bold mb-4 mt-8">2. Maturity & Usage</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Project Stage*</Form.Label>
        <Stack direction="vertical" gap={2}>
          <Form.Check
            type="radio"
            id="stage-early"
            name="projectStage"
            label="Early stage"
            checked={form.maturityAndUsage.projectStage === "early"}
            isInvalid={validated && !form.maturityAndUsage.projectStage}
            onChange={() =>
              setForm({
                ...form,
                maturityAndUsage: {
                  ...form.maturityAndUsage,
                  projectStage: "early",
                },
              })
            }
          />
          <Form.Check
            type="radio"
            id="stage-live"
            name="projectStage"
            label="Live product"
            checked={form.maturityAndUsage.projectStage === "live"}
            isInvalid={validated && !form.maturityAndUsage.projectStage}
            onChange={() =>
              setForm({
                ...form,
                maturityAndUsage: {
                  ...form.maturityAndUsage,
                  projectStage: "live",
                },
              })
            }
          />
          <Form.Check
            type="radio"
            id="stage-mature"
            name="projectStage"
            label="Mature product with active users"
            checked={form.maturityAndUsage.projectStage === "mature"}
            isInvalid={validated && !form.maturityAndUsage.projectStage}
            onChange={() =>
              setForm({
                ...form,
                maturityAndUsage: {
                  ...form.maturityAndUsage,
                  projectStage: "mature",
                },
              })
            }
          />
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Lifetime Users (0 is a valid answer if you&apos;re early)*
        </Form.Label>
        <Form.Control
          type="number"
          value={form.maturityAndUsage.lifetimeUsers}
          placeholder=""
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && form.maturityAndUsage.lifetimeUsers === "" ? "border-danger" : "border-dark"}`}
          style={{ maxWidth: 200 }}
          isInvalid={validated && form.maturityAndUsage.lifetimeUsers === ""}
          onChange={(e) =>
            setForm({
              ...form,
              maturityAndUsage: {
                ...form.maturityAndUsage,
                lifetimeUsers: e.target.value,
              },
            })
          }
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Active Users*</Form.Label>
        <Stack direction="horizontal" gap={3} className="align-items-start">
          <Form.Control
            type="number"
            value={form.maturityAndUsage.activeUsers}
            placeholder=""
            className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && form.maturityAndUsage.activeUsers === "" ? "border-danger" : "border-dark"}`}
            style={{ maxWidth: 200 }}
            isInvalid={validated && form.maturityAndUsage.activeUsers === ""}
            onChange={(e) =>
              setForm({
                ...form,
                maturityAndUsage: {
                  ...form.maturityAndUsage,
                  activeUsers: e.target.value,
                },
              })
            }
          />
          <Dropdown>
            <Dropdown.Toggle
              variant="white"
              className="bg-white border border-2 border-dark rounded-4 py-3 px-3 d-flex align-items-center gap-2"
              style={{ minWidth: 220 }}
            >
              {
                ACTIVE_USERS_FREQUENCY_OPTIONS.find(
                  (o) => o.value === form.maturityAndUsage.activeUsersFrequency,
                )?.label
              }
            </Dropdown.Toggle>
            <Dropdown.Menu className="border border-dark p-2 lh-lg">
              {ACTIVE_USERS_FREQUENCY_OPTIONS.map((option) => (
                <Dropdown.Item
                  key={option.value}
                  onClick={() =>
                    setForm({
                      ...form,
                      maturityAndUsage: {
                        ...form.maturityAndUsage,
                        activeUsersFrequency: option.value as
                          | "daily"
                          | "weekly"
                          | "monthly",
                      },
                    })
                  }
                >
                  {option.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Other relevant usage data (if available)
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={form.maturityAndUsage.otherUsageData}
          placeholder=""
          className="bg-white border border-2 border-dark rounded-2 py-3 px-3"
          style={{ resize: "vertical" }}
          onChange={(e) =>
            setForm({
              ...form,
              maturityAndUsage: {
                ...form.maturityAndUsage,
                otherUsageData: e.target.value,
              },
            })
          }
        />
      </Form.Group>

      {/* Section 3: Integration */}
      <h4 className="fw-bold mb-4 mt-8">3. Integration</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          G$ Integration Status*
        </Form.Label>
        <Stack direction="vertical" gap={2}>
          <Form.Check
            type="radio"
            id="integration-live"
            name="integrationStatus"
            label="Live"
            checked={form.integration.status === "live"}
            isInvalid={validated && !form.integration.status}
            onChange={() =>
              setForm({
                ...form,
                integration: { ...form.integration, status: "live" },
              })
            }
          />
          <Form.Check
            type="radio"
            id="integration-ready"
            name="integrationStatus"
            label="Ready soon"
            checked={form.integration.status === "ready"}
            isInvalid={validated && !form.integration.status}
            onChange={() =>
              setForm({
                ...form,
                integration: { ...form.integration, status: "ready" },
              })
            }
          />
          <Form.Check
            type="radio"
            id="integration-planned"
            name="integrationStatus"
            label="Planned (eligible only if delivered)"
            checked={form.integration.status === "planned"}
            isInvalid={validated && !form.integration.status}
            onChange={() =>
              setForm({
                ...form,
                integration: { ...form.integration, status: "planned" },
              })
            }
          />
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Integration Type*</Form.Label>
        <Stack direction="vertical" gap={2}>
          {INTEGRATION_TYPE_OPTIONS.map((option) => (
            <Stack
              key={option.value}
              direction="horizontal"
              gap={2}
              className="align-items-center"
            >
              <Form.Check
                type="checkbox"
                id={`integration-type-${option.value}`}
                label={option.label}
                checked={form.integration.types.includes(option.value)}
                isInvalid={validated && form.integration.types.length === 0}
                onChange={(e) =>
                  handleIntegrationTypeChange(option.value, e.target.checked)
                }
              />
              {option.value === "other" &&
                form.integration.types.includes("other") && (
                  <Form.Control
                    type="text"
                    value={form.integration.otherTypeExplanation}
                    placeholder="Explain"
                    className={`bg-white border border-2 rounded-4 py-2 px-3 ${validated && form.integration.types.includes("other") && !form.integration.otherTypeExplanation.trim() ? "border-danger" : "border-dark"}`}
                    style={{ maxWidth: 200 }}
                    isInvalid={
                      validated &&
                      form.integration.types.includes("other") &&
                      !form.integration.otherTypeExplanation.trim()
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        integration: {
                          ...form.integration,
                          otherTypeExplanation: e.target.value,
                        },
                      })
                    }
                  />
                )}
            </Stack>
          ))}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Describe your G$ integration & why it matters (1-3 sentences)*
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={form.integration.description}
          placeholder="Value for users + GoodDollar ecosystem"
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${validated && !form.integration.description.trim() ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical" }}
          isInvalid={validated && !form.integration.description.trim()}
          onChange={(e) =>
            setForm({
              ...form,
              integration: { ...form.integration, description: e.target.value },
            })
          }
        />
      </Form.Group>

      <InfoBox title="Season 3 Expectations">
        <p className="mb-2">
          Growth is an emphasis for this GoodBuilders round. Every project, even
          early-stage, should focus on how it&apos;ll attract new users,
          partners, capital, etc.
        </p>
        <p className="mb-2">
          Our relative bar for your growth plan depends on two things:
        </p>
        <ul className="mb-2 ps-3">
          <li>
            Your GoodBuilders stage (how many rounds you&apos;ve already
            completed)
          </li>
          <li>Your product maturity (MVP → live → active users)</li>
        </ul>
        <p className="mb-0">
          Growth can look different depending on your context — from first user
          tests (early) to large activations and G$ usage (advanced).
        </p>
      </InfoBox>

      {/* Section 4: What you'll build */}
      <h4 className="fw-bold mb-4 mt-8">4. What you&apos;ll build</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Primary Build Goal (1 sentence)*
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={form.buildGoals.primaryBuildGoal}
          placeholder="A clear statement of your team's main objective for building in this round."
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${validated && !form.buildGoals.primaryBuildGoal.trim() ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical" }}
          isInvalid={validated && !form.buildGoals.primaryBuildGoal.trim()}
          onChange={(e) =>
            setForm({
              ...form,
              buildGoals: {
                ...form.buildGoals,
                primaryBuildGoal: e.target.value,
              },
            })
          }
        />
      </Form.Group>

      {form.buildGoals.milestones.map((milestone, index) => (
        <MilestoneInput
          key={index}
          milestone={milestone}
          onChange={(m) =>
            handleUpdateBuildMilestone(index, m as BuildMilestone)
          }
          onRemove={
            form.buildGoals.milestones.length > 1
              ? () => handleRemoveBuildMilestone(index)
              : undefined
          }
          validated={validated}
          required={index === 0}
          type="build"
          index={index}
        />
      ))}

      <Button
        variant="link"
        className="p-0 text-start text-decoration-underline fw-semi-bold text-primary mb-4"
        onClick={handleAddBuildMilestone}
      >
        Add Milestone
      </Button>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Ecosystem Impact (1-2 sentences)
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={form.buildGoals.ecosystemImpact}
          placeholder="Why your build matters for the GoodDollar ecosystem (utility, integrations, community value)."
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${(validated || touched.buildEcosystemImpact) && form.buildGoals.ecosystemImpact.length > CHARACTER_LIMITS.ecosystemImpact.max ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical", backgroundImage: "none" }}
          isInvalid={
            (validated || touched.buildEcosystemImpact) &&
            form.buildGoals.ecosystemImpact.length >
              CHARACTER_LIMITS.ecosystemImpact.max
          }
          onChange={(e) =>
            setForm({
              ...form,
              buildGoals: {
                ...form.buildGoals,
                ecosystemImpact: e.target.value,
              },
            })
          }
          onBlur={() =>
            setTouched((prev) => ({ ...prev, buildEcosystemImpact: true }))
          }
        />
        <CharacterCounter
          value={form.buildGoals.ecosystemImpact}
          max={CHARACTER_LIMITS.ecosystemImpact.max}
        />
      </Form.Group>

      {/* Section 5: How you'll grow */}
      <h4 className="fw-bold mb-4 mt-8">5. How you&apos;ll grow</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Primary Growth Goal (1 sentence)*
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={form.growthGoals.primaryGrowthGoal}
          placeholder="What you aim to grow or activate during this round (users, tx, TVL, pilots, partners, adoption)"
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${validated && !form.growthGoals.primaryGrowthGoal.trim() ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical" }}
          isInvalid={validated && !form.growthGoals.primaryGrowthGoal.trim()}
          onChange={(e) =>
            setForm({
              ...form,
              growthGoals: {
                ...form.growthGoals,
                primaryGrowthGoal: e.target.value,
              },
            })
          }
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Target Users, Communities, and/or Partners*
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={form.growthGoals.targetUsers}
          placeholder="Who will drive this growth (segments, communities, regions, partners)?"
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${validated && !form.growthGoals.targetUsers.trim() ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical" }}
          isInvalid={validated && !form.growthGoals.targetUsers.trim()}
          onChange={(e) =>
            setForm({
              ...form,
              growthGoals: { ...form.growthGoals, targetUsers: e.target.value },
            })
          }
        />
      </Form.Group>

      {form.growthGoals.milestones.map((milestone, index) => (
        <MilestoneInput
          key={index}
          milestone={milestone}
          onChange={(m) =>
            handleUpdateGrowthMilestone(index, m as GrowthMilestone)
          }
          onRemove={
            form.growthGoals.milestones.length > 1
              ? () => handleRemoveGrowthMilestone(index)
              : undefined
          }
          validated={validated}
          required={index === 0}
          type="growth"
          index={index}
        />
      ))}

      <Button
        variant="link"
        className="p-0 text-start text-decoration-underline fw-semi-bold text-primary mb-4"
        onClick={handleAddGrowthMilestone}
      >
        Add Milestone
      </Button>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Ecosystem Impact (1-2 sentences)
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={form.growthGoals.ecosystemImpact}
          placeholder="Why your growth matters for the GoodDollar ecosystem (network effects, G$ adoption, etc)"
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${(validated || touched.growthEcosystemImpact) && form.growthGoals.ecosystemImpact.length > CHARACTER_LIMITS.ecosystemImpact.max ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical", backgroundImage: "none" }}
          isInvalid={
            (validated || touched.growthEcosystemImpact) &&
            form.growthGoals.ecosystemImpact.length >
              CHARACTER_LIMITS.ecosystemImpact.max
          }
          onChange={(e) =>
            setForm({
              ...form,
              growthGoals: {
                ...form.growthGoals,
                ecosystemImpact: e.target.value,
              },
            })
          }
          onBlur={() =>
            setTouched((prev) => ({ ...prev, growthEcosystemImpact: true }))
          }
        />
        <CharacterCounter
          value={form.growthGoals.ecosystemImpact}
          max={CHARACTER_LIMITS.ecosystemImpact.max}
        />
      </Form.Group>

      {/* Section 6: Team */}
      <h4 className="fw-bold mb-4 mt-8">6. Team</h4>
      <TeamMemberInput
        member={form.team.primaryContact}
        onChange={(member) =>
          setForm({
            ...form,
            team: { ...form.team, primaryContact: member },
          })
        }
        validated={validated}
        isPrimary
        label="Primary Contact"
      />

      {form.team.additionalTeammates.map((teammate, index) => (
        <TeamMemberInput
          key={index}
          member={teammate}
          onChange={(member) => handleUpdateTeammate(index, member)}
          onRemove={() => handleRemoveTeammate(index)}
          validated={validated}
          label={`Teammate ${index + 2}`}
        />
      ))}

      <Button
        variant="link"
        className="p-0 text-start text-decoration-underline fw-semi-bold text-primary mb-4"
        onClick={handleAddTeammate}
      >
        Add Teammate
      </Button>

      {/* Section 7: Additional */}
      <h4 className="fw-bold mb-4 mt-8">7. Additional</h4>
      <Form.Group className="mb-4">
        <Form.Control
          as="textarea"
          rows={4}
          value={form.additional.comments}
          placeholder="Provide any additional context or comments"
          className="bg-white border border-2 border-dark rounded-2 py-3 px-3"
          style={{ resize: "vertical" }}
          onChange={(e) =>
            setForm({
              ...form,
              additional: { ...form.additional, comments: e.target.value },
            })
          }
        />
      </Form.Group>

      {/* Navigation */}
      <Stack direction="horizontal" gap={3} className="mb-30">
        <Button
          variant="secondary"
          className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
          style={{ backgroundColor: "#45ad57", borderColor: "#45ad57" }}
          onClick={onBack}
        >
          Back
        </Button>
        {!session || session.address !== address ? (
          <Button
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={handleSubmit}
          >
            Sign In With Ethereum
          </Button>
        ) : (
          <Button
            disabled={validated && !isValid}
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            style={{ minWidth: 120 }}
            onClick={handleSubmit}
          >
            {isSubmitting ? <Spinner size="sm" /> : "Next"}
          </Button>
        )}
      </Stack>

      {error && <p className="text-danger fw-semi-bold">{error}</p>}
      {validated && !isValid && (
        <p className="text-danger fw-semi-bold">
          *Please complete the required fields.
        </p>
      )}
    </Form>
  );
}
