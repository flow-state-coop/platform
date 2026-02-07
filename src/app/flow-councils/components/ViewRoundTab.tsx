"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import ResizableTextarea from "@/components/ResizableTextarea";
import {
  type IntegrationType,
  type RoundForm,
  INITIAL_ROUND_FORM,
} from "@/app/flow-councils/types/round";

type ViewRoundTabProps = {
  roundData: RoundForm | null;
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
  const { roundData } = props;

  const previousParticipation =
    roundData?.previousParticipation ||
    INITIAL_ROUND_FORM.previousParticipation;

  const maturityAndUsage =
    roundData?.maturityAndUsage || INITIAL_ROUND_FORM.maturityAndUsage;

  const integration = roundData?.integration || INITIAL_ROUND_FORM.integration;

  const buildGoals = roundData?.buildGoals || INITIAL_ROUND_FORM.buildGoals;

  const growthGoals = roundData?.growthGoals || INITIAL_ROUND_FORM.growthGoals;

  const team = roundData?.team || INITIAL_ROUND_FORM.team;

  const additional = roundData?.additional || { comments: "" };

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
                : ""
          }
          placeholder="Select Yes or No"
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
              value={previousParticipation.numberOfRounds}
              placeholder="Enter number of rounds"
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
              value={previousParticipation.previousKarmaUpdates}
              placeholder="https://karmahq.xyz/project/..."
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="fs-lg fw-bold">
              Current state of the project
            </Form.Label>
            <ResizableTextarea
              rows={4}
              value={previousParticipation.currentProjectState}
              placeholder="Describe progress made, blockers, and what you've been up to"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
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
              : ""
          }
          placeholder="Select project stage"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Lifetime Users</Form.Label>
        <Form.Control
          type="text"
          value={maturityAndUsage.lifetimeUsers}
          placeholder="Enter lifetime users count"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Active Users</Form.Label>
        <Stack direction="horizontal" gap={3}>
          <Form.Control
            type="text"
            value={maturityAndUsage.activeUsers}
            placeholder="Enter active users"
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
        <ResizableTextarea
          rows={4}
          value={maturityAndUsage.otherUsageData}
          placeholder="Any other relevant usage data"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
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
              : ""
          }
          placeholder="Select integration status"
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
              value=""
              placeholder="Select integration types"
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
        <ResizableTextarea
          rows={4}
          value={integration.description}
          placeholder="Value for users + GoodDollar ecosystem"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {/* Section 4: What you'll build */}
      <h4 className="fw-bold mb-4 mt-8">4. What you&apos;ll build</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Primary Build Goal</Form.Label>
        <ResizableTextarea
          rows={2}
          value={buildGoals.primaryBuildGoal}
          placeholder="A clear statement of your team's main objective for building in this round"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Build Milestones</Form.Label>
        <Stack direction="vertical" gap={3}>
          {buildGoals.milestones.length > 0 ? (
            buildGoals.milestones.map((milestone, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <h6 className="fw-bold mb-2">
                  Milestone {index + 1}: {milestone.title || "(Title)"}
                </h6>
                <p className="mb-2 text-muted">
                  {milestone.description || "(Description)"}
                </p>
                <span className="fw-semi-bold">Deliverables:</span>
                <ul className="mb-0">
                  {milestone.deliverables.filter((d) => d.trim()).length > 0 ? (
                    milestone.deliverables
                      .filter((d) => d.trim())
                      .map((d, i) => <li key={i}>{d}</li>)
                  ) : (
                    <li className="text-muted">(Deliverable items)</li>
                  )}
                </ul>
              </div>
            ))
          ) : (
            <div className="bg-light rounded-4 p-3">
              <h6 className="fw-bold mb-2 text-muted">Milestone 1: (Title)</h6>
              <p className="mb-2 text-muted">(Description)</p>
              <span className="fw-semi-bold">Deliverables:</span>
              <ul className="mb-0">
                <li className="text-muted">(Deliverable items)</li>
              </ul>
            </div>
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Build Ecosystem Impact
        </Form.Label>
        <ResizableTextarea
          rows={3}
          value={buildGoals.ecosystemImpact}
          placeholder="Why your build matters for the GoodDollar ecosystem"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {/* Section 5: How you'll grow */}
      <h4 className="fw-bold mb-4 mt-8">5. How you&apos;ll grow</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Primary Growth Goal</Form.Label>
        <ResizableTextarea
          rows={2}
          value={growthGoals.primaryGrowthGoal}
          placeholder="What you aim to grow or activate during this round"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Target Users, Communities, and/or Partners
        </Form.Label>
        <ResizableTextarea
          rows={3}
          value={growthGoals.targetUsers}
          placeholder="Who will drive this growth (segments, communities, regions, partners)?"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Growth Milestones</Form.Label>
        <Stack direction="vertical" gap={3}>
          {growthGoals.milestones.length > 0 ? (
            growthGoals.milestones.map((milestone, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <h6 className="fw-bold mb-2">
                  Milestone {index + 1}: {milestone.title || "(Title)"}
                </h6>
                <p className="mb-2 text-muted">
                  {milestone.description || "(Description)"}
                </p>
                <span className="fw-semi-bold">Activations:</span>
                <ul className="mb-0">
                  {milestone.activations.filter((a) => a.trim()).length > 0 ? (
                    milestone.activations
                      .filter((a) => a.trim())
                      .map((a, i) => <li key={i}>{a}</li>)
                  ) : (
                    <li className="text-muted">(Activation items)</li>
                  )}
                </ul>
              </div>
            ))
          ) : (
            <div className="bg-light rounded-4 p-3">
              <h6 className="fw-bold mb-2 text-muted">Milestone 1: (Title)</h6>
              <p className="mb-2 text-muted">(Description)</p>
              <span className="fw-semi-bold">Activations:</span>
              <ul className="mb-0">
                <li className="text-muted">(Activation items)</li>
              </ul>
            </div>
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Growth Ecosystem Impact
        </Form.Label>
        <ResizableTextarea
          rows={3}
          value={growthGoals.ecosystemImpact}
          placeholder="Why your growth matters for the GoodDollar ecosystem"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
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
              <span className={team.primaryContact.name ? "" : "text-muted"}>
                {team.primaryContact.name || "(Enter name)"}
              </span>
            </div>
            <div>
              <span className="fw-semi-bold">Role: </span>
              <span
                className={
                  team.primaryContact.roleDescription ? "" : "text-muted"
                }
              >
                {team.primaryContact.roleDescription ||
                  "(Enter role description)"}
              </span>
            </div>
            <div>
              <span className="fw-semi-bold">Telegram: </span>
              <span
                className={team.primaryContact.telegram ? "" : "text-muted"}
              >
                {team.primaryContact.telegram || "(Optional)"}
              </span>
            </div>
            <div>
              <span className="fw-semi-bold">GitHub/LinkedIn: </span>
              <span
                className={
                  team.primaryContact.githubOrLinkedin ? "" : "text-muted"
                }
              >
                {team.primaryContact.githubOrLinkedin || "(Optional)"}
              </span>
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
                    <span className={teammate.name ? "" : "text-muted"}>
                      {teammate.name || "(Enter name)"}
                    </span>
                  </div>
                  <div>
                    <span className="fw-semi-bold">Role: </span>
                    <span
                      className={teammate.roleDescription ? "" : "text-muted"}
                    >
                      {teammate.roleDescription || "(Enter role description)"}
                    </span>
                  </div>
                  <div>
                    <span className="fw-semi-bold">Telegram: </span>
                    <span className={teammate.telegram ? "" : "text-muted"}>
                      {teammate.telegram || "(Optional)"}
                    </span>
                  </div>
                  <div>
                    <span className="fw-semi-bold">GitHub/LinkedIn: </span>
                    <span
                      className={teammate.githubOrLinkedin ? "" : "text-muted"}
                    >
                      {teammate.githubOrLinkedin || "(Optional)"}
                    </span>
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
        <ResizableTextarea
          rows={4}
          value={additional.comments}
          placeholder="Provide any additional context or comments"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>
    </div>
  );
}
