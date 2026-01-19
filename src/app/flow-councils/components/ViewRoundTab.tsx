"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";

export type IntegrationType =
  | "payments"
  | "identity"
  | "claimFlow"
  | "goodCollective"
  | "supertoken"
  | "activityFees"
  | "other";

export type BuildMilestone = {
  title: string;
  description: string;
  deliverables: string[];
};

export type GrowthMilestone = {
  title: string;
  description: string;
  activations: string[];
};

export type TeamMember = {
  name: string;
  roleDescription: string;
  telegram?: string;
  githubOrLinkedin?: string;
};

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

type ViewRoundTabProps = {
  roundData: RoundForm | null;
  previousTabIncomplete?: boolean;
};

const INTEGRATION_TYPE_LABELS: Record<IntegrationType, string> = {
  payments: "Payments/rewards using G$",
  identity: "Identity",
  claimFlow: "Claim flow",
  goodCollective: "GoodCollective pools",
  supertoken: "G$ Supertoken/streaming",
  activityFees: "Activity fees --> UBI Pool",
  other: "Other",
};

const PROJECT_STAGE_LABELS: Record<string, string> = {
  early: "Early stage",
  live: "Live product",
  mature: "Mature product with active users",
};

const INTEGRATION_STATUS_LABELS: Record<string, string> = {
  live: "Live",
  ready: "Ready soon",
  planned: "Planned (eligible only if delivered)",
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily Active Users",
  weekly: "Weekly Active Users",
  monthly: "Monthly Active Users",
};

export default function ViewRoundTab(props: ViewRoundTabProps) {
  const { roundData, previousTabIncomplete } = props;

  if (previousTabIncomplete) {
    return (
      <p className="text-muted">
        Please complete the Project tab first to unlock this section.
      </p>
    );
  }

  if (!roundData) {
    return <p className="text-muted">No round data available.</p>;
  }

  const previousParticipation = roundData.previousParticipation || {
    hasParticipatedBefore: null,
    numberOfRounds: "",
    previousKarmaUpdates: "",
    currentProjectState: "",
  };

  const maturityAndUsage = roundData.maturityAndUsage || {
    projectStage: null,
    lifetimeUsers: "",
    activeUsers: "",
    activeUsersFrequency: "weekly" as const,
    otherUsageData: "",
  };

  const integration = roundData.integration || {
    status: null,
    types: [] as IntegrationType[],
    otherTypeExplanation: "",
    description: "",
  };

  const buildGoals = roundData.buildGoals || {
    primaryBuildGoal: "",
    milestones: [] as BuildMilestone[],
    ecosystemImpact: "",
  };

  const growthGoals = roundData.growthGoals || {
    primaryGrowthGoal: "",
    targetUsers: "",
    milestones: [] as GrowthMilestone[],
    ecosystemImpact: "",
  };

  const team = roundData.team || {
    primaryContact: {
      name: "",
      roleDescription: "",
      telegram: "",
      githubOrLinkedin: "",
    } as TeamMember,
    additionalTeammates: [] as TeamMember[],
  };

  const additional = roundData.additional || { comments: "" };

  return (
    <div>
      {/* Section 1: Previous Participation */}
      <h4 className="fw-bold mb-4">1. Previous Participation</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Have you participated in GoodBuilders before?
        </Form.Label>
        <Form.Control
          type="text"
          value={
            previousParticipation.hasParticipatedBefore === true
              ? "Yes"
              : previousParticipation.hasParticipatedBefore === false
                ? "No"
                : "N/A"
          }
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {previousParticipation.hasParticipatedBefore === true && (
        <>
          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold">Number of Rounds</Form.Label>
            <Form.Control
              type="text"
              value={previousParticipation.numberOfRounds || "N/A"}
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold">
              Previous Karma Updates
            </Form.Label>
            <Form.Control
              type="text"
              value={previousParticipation.previousKarmaUpdates || "N/A"}
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold">
              Current state of the project
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={previousParticipation.currentProjectState || "N/A"}
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
              style={{ resize: "none" }}
            />
          </Form.Group>
        </>
      )}

      {/* Section 2: Maturity & Usage */}
      <h4 className="fw-bold mb-4 mt-8">2. Maturity & Usage</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Project Stage</Form.Label>
        <Form.Control
          type="text"
          value={
            maturityAndUsage.projectStage
              ? PROJECT_STAGE_LABELS[maturityAndUsage.projectStage]
              : "N/A"
          }
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Lifetime Users</Form.Label>
        <Form.Control
          type="text"
          value={maturityAndUsage.lifetimeUsers || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Active Users</Form.Label>
        <Stack direction="horizontal" gap={3}>
          <Form.Control
            type="text"
            value={maturityAndUsage.activeUsers || "N/A"}
            disabled
            className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            style={{ maxWidth: 200 }}
          />
          <Form.Control
            type="text"
            value={
              FREQUENCY_LABELS[maturityAndUsage.activeUsersFrequency] || ""
            }
            disabled
            className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            style={{ maxWidth: 220 }}
          />
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Other relevant usage data
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={maturityAndUsage.otherUsageData || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      {/* Section 3: Integration */}
      <h4 className="fw-bold mb-4 mt-8">3. Integration</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">G$ Integration Status</Form.Label>
        <Form.Control
          type="text"
          value={
            integration.status
              ? INTEGRATION_STATUS_LABELS[integration.status]
              : "N/A"
          }
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Integration Types</Form.Label>
        <Stack direction="vertical" gap={2}>
          {integration.types.length > 0 ? (
            integration.types.map((type, index) => (
              <Form.Control
                key={index}
                type="text"
                value={
                  type === "other" && integration.otherTypeExplanation
                    ? `Other: ${integration.otherTypeExplanation}`
                    : INTEGRATION_TYPE_LABELS[type]
                }
                disabled
                className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
              />
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Integration Description
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={integration.description || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      {/* Section 4: What you'll build */}
      <h4 className="fw-bold mb-4 mt-8">4. What you&apos;ll build</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Primary Build Goal</Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={buildGoals.primaryBuildGoal || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Build Milestones</Form.Label>
        <Stack direction="vertical" gap={3}>
          {buildGoals.milestones.length > 0 ? (
            buildGoals.milestones.map((milestone, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <h6 className="fw-bold mb-2">
                  Milestone {index + 1}: {milestone.title || "N/A"}
                </h6>
                <p className="mb-2">{milestone.description || "N/A"}</p>
                <span className="fw-semi-bold">Deliverables:</span>
                <ul className="mb-0">
                  {milestone.deliverables.filter((d) => d.trim()).length > 0 ? (
                    milestone.deliverables
                      .filter((d) => d.trim())
                      .map((d, i) => <li key={i}>{d}</li>)
                  ) : (
                    <li>N/A</li>
                  )}
                </ul>
              </div>
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Build Ecosystem Impact
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={buildGoals.ecosystemImpact || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      {/* Section 5: How you'll grow */}
      <h4 className="fw-bold mb-4 mt-8">5. How you&apos;ll grow</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Primary Growth Goal</Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={growthGoals.primaryGrowthGoal || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Target Users, Communities, and/or Partners
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={growthGoals.targetUsers || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Growth Milestones</Form.Label>
        <Stack direction="vertical" gap={3}>
          {growthGoals.milestones.length > 0 ? (
            growthGoals.milestones.map((milestone, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <h6 className="fw-bold mb-2">
                  Milestone {index + 1}: {milestone.title || "N/A"}
                </h6>
                <p className="mb-2">{milestone.description || "N/A"}</p>
                <span className="fw-semi-bold">Activations:</span>
                <ul className="mb-0">
                  {milestone.activations.filter((a) => a.trim()).length > 0 ? (
                    milestone.activations
                      .filter((a) => a.trim())
                      .map((a, i) => <li key={i}>{a}</li>)
                  ) : (
                    <li>N/A</li>
                  )}
                </ul>
              </div>
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Growth Ecosystem Impact
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={growthGoals.ecosystemImpact || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>

      {/* Section 6: Team */}
      <h4 className="fw-bold mb-4 mt-8">6. Team</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Primary Contact</Form.Label>
        <div className="bg-light rounded-4 p-3">
          <Stack direction="vertical" gap={2}>
            <div>
              <span className="fw-semi-bold">Name: </span>
              {team.primaryContact.name || "N/A"}
            </div>
            <div>
              <span className="fw-semi-bold">Role: </span>
              {team.primaryContact.roleDescription || "N/A"}
            </div>
            <div>
              <span className="fw-semi-bold">Telegram: </span>
              {team.primaryContact.telegram || "N/A"}
            </div>
            <div>
              <span className="fw-semi-bold">GitHub/LinkedIn: </span>
              {team.primaryContact.githubOrLinkedin || "N/A"}
            </div>
          </Stack>
        </div>
      </Form.Group>

      {team.additionalTeammates.length > 0 && (
        <Form.Group className="mb-4">
          <Form.Label className="fs-lg fw-bold">
            Additional Teammates
          </Form.Label>
          <Stack direction="vertical" gap={3}>
            {team.additionalTeammates.map((teammate, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <h6 className="fw-bold mb-2">Teammate {index + 2}</h6>
                <Stack direction="vertical" gap={2}>
                  <div>
                    <span className="fw-semi-bold">Name: </span>
                    {teammate.name || "N/A"}
                  </div>
                  <div>
                    <span className="fw-semi-bold">Role: </span>
                    {teammate.roleDescription || "N/A"}
                  </div>
                  <div>
                    <span className="fw-semi-bold">Telegram: </span>
                    {teammate.telegram || "N/A"}
                  </div>
                  <div>
                    <span className="fw-semi-bold">GitHub/LinkedIn: </span>
                    {teammate.githubOrLinkedin || "N/A"}
                  </div>
                </Stack>
              </div>
            ))}
          </Stack>
        </Form.Group>
      )}

      {/* Section 7: Additional */}
      <h4 className="fw-bold mb-4 mt-8">7. Additional</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Additional Comments</Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={additional.comments || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          style={{ resize: "none" }}
        />
      </Form.Group>
    </div>
  );
}
