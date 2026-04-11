import {
  type RoundForm,
  type AttestationForm,
  type TeamMember,
  PROJECT_STAGE_LABELS,
  INTEGRATION_STATUS_LABELS,
  FREQUENCY_LABELS,
  INTEGRATION_TYPE_LABELS,
  RECIPIENT_TYPE_LABELS,
} from "@/app/flow-councils/types/round";
import {
  GOODBUILDERS_TEMPLATE,
  type FormSchema,
} from "@/app/flow-councils/types/formSchema";

type MilestoneLike = { title?: string; description?: string };

function formatMilestones<T extends MilestoneLike>(
  milestones: T[],
  getItems: (m: T) => string[],
  itemsLabel: string,
): string {
  return milestones
    .map((m, i) => {
      const items = getItems(m)
        .filter((x) => x.trim())
        .map((x) => `- ${x}`)
        .join("\n");
      return [
        `**Milestone ${i + 1}: ${m.title || "(Untitled)"}**`,
        m.description || "",
        items ? `${itemsLabel}:\n${items}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function formatTeammates(teammates: TeamMember[]): string {
  return teammates
    .map((t, i) => {
      const parts = [`**Teammate ${i + 2}**`];
      if (t.name) parts.push(`Name: ${t.name}`);
      if (t.roleDescription) parts.push(`Role: ${t.roleDescription}`);
      if (t.telegram) parts.push(`Telegram: ${t.telegram}`);
      if (t.githubOrLinkedin)
        parts.push(`GitHub/LinkedIn: ${t.githubOrLinkedin}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export function adaptLegacyRoundData(
  data: Partial<RoundForm>,
): Record<string, unknown> {
  const p = data.previousParticipation;
  const m = data.maturityAndUsage;
  const integ = data.integration;
  const build = data.buildGoals;
  const growth = data.growthGoals;
  const team = data.team;
  const contact = team?.primaryContact;

  const integrationTypes = (integ?.types ?? []).map((t) => {
    if (t === "other" && integ?.otherTypeExplanation) {
      return `Other: ${integ.otherTypeExplanation}`;
    }
    return INTEGRATION_TYPE_LABELS[t];
  });

  return {
    "gb-r-q01": p?.hasParticipatedBefore,
    "gb-r-q02": p?.numberOfRounds ? Number(p.numberOfRounds) : undefined,
    "gb-r-q03": p?.previousKarmaUpdates || undefined,
    "gb-r-q04": p?.currentProjectState || undefined,
    "gb-r-q05": m?.projectStage
      ? PROJECT_STAGE_LABELS[m.projectStage]
      : undefined,
    "gb-r-q06": m?.lifetimeUsers ? Number(m.lifetimeUsers) : undefined,
    "gb-r-q07": m?.activeUsers ? Number(m.activeUsers) : undefined,
    "gb-r-q08": m?.activeUsersFrequency
      ? FREQUENCY_LABELS[m.activeUsersFrequency]
      : undefined,
    "gb-r-q09": m?.otherUsageData || undefined,
    "gb-r-q10": integ?.status
      ? INTEGRATION_STATUS_LABELS[integ.status]
      : undefined,
    "gb-r-q11": integrationTypes.length > 0 ? integrationTypes : undefined,
    "gb-r-q12": integ?.description || undefined,
    "gb-r-q13": build?.primaryBuildGoal || undefined,
    "gb-r-q14":
      (build?.milestones?.length ?? 0) > 0
        ? formatMilestones(
            build!.milestones,
            (m) => m.deliverables,
            "Deliverables",
          )
        : undefined,
    "gb-r-q15": build?.ecosystemImpact || undefined,
    "gb-r-q16": growth?.primaryGrowthGoal || undefined,
    "gb-r-q17": growth?.targetUsers || undefined,
    "gb-r-q18":
      (growth?.milestones?.length ?? 0) > 0
        ? formatMilestones(
            growth!.milestones,
            (m) => m.activations,
            "Activations",
          )
        : undefined,
    "gb-r-q19": growth?.ecosystemImpact || undefined,
    "gb-r-q20": contact?.name || undefined,
    "gb-r-q21": contact?.roleDescription || undefined,
    "gb-r-q22": contact?.telegram || undefined,
    "gb-r-q23": contact?.githubOrLinkedin || undefined,
    "gb-r-q24":
      (team?.additionalTeammates?.length ?? 0) > 0
        ? formatTeammates(team!.additionalTeammates)
        : undefined,
    "gb-r-q25": data.additional?.comments || undefined,
  };
}

export function adaptLegacyAttestationData(
  data: Partial<AttestationForm>,
): Record<string, unknown> {
  return {
    "gb-a-q01": data.commitment?.agreedToCommitments,
    "gb-a-q02": data.identity?.recipientType
      ? RECIPIENT_TYPE_LABELS[data.identity.recipientType]
      : undefined,
    "gb-a-q03": data.identity?.legalName || undefined,
    "gb-a-q04": data.identity?.country || undefined,
    "gb-a-q05": data.identity?.address || undefined,
    "gb-a-q06": data.identity?.contactEmail || undefined,
    "gb-a-q07": data.dataAcknowledgement?.gdprConsent,
    "gb-a-q08": data.privacyTransparency?.agreedToPrivacy,
  };
}

type DetailsShape = {
  round?: Record<string, unknown>;
  attestation?: Partial<AttestationForm> | Record<string, unknown>;
  eligibility?: Partial<AttestationForm> | Record<string, unknown>;
};

export function getApplicationAsDynamic(
  details: unknown,
  roundFormSchema: FormSchema | null | undefined,
): {
  schema: FormSchema;
  roundValues: Record<string, unknown>;
  attestationValues: Record<string, unknown>;
} {
  const schema = roundFormSchema ?? GOODBUILDERS_TEMPLATE;

  if (!details) {
    return { schema, roundValues: {}, attestationValues: {} };
  }

  if (roundFormSchema) {
    const d = details as DetailsShape;
    return {
      schema,
      roundValues: d.round ?? {},
      attestationValues: (d.attestation as Record<string, unknown>) ?? {},
    };
  }

  const d = details as DetailsShape;
  const roundValues = adaptLegacyRoundData(details as Partial<RoundForm>);
  const legacyAttestation = d.attestation ?? d.eligibility;
  const attestationValues = legacyAttestation
    ? adaptLegacyAttestationData(legacyAttestation as Partial<AttestationForm>)
    : {};
  return { schema, roundValues, attestationValues };
}
