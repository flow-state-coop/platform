import { z } from "zod";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";

const smartContractSchema = z.object({
  type: z.enum(["projectAddress", "goodCollectivePool"]),
  network: z.string(),
  address: z.string(),
});

const otherLinkSchema = z.object({
  description: z.string(),
  url: z.string(),
});

export const projectDetailsSchema = z.object({
  name: z.string().min(1),
  description: z
    .string()
    .min(CHARACTER_LIMITS.projectDescription.min)
    .max(CHARACTER_LIMITS.projectDescription.max),
  logoUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  website: z.string().optional(),
  twitter: z.string().optional(),
  github: z.string().optional(),
  defaultFundingAddress: z.string().optional(),
  demoUrl: z.string().optional(),
  farcaster: z.string().optional(),
  telegram: z.string().optional(),
  discord: z.string().optional(),
  karmaProfile: z.string().optional(),
  githubRepos: z.array(z.string()).optional(),
  smartContracts: z.array(smartContractSchema).optional(),
  otherLinks: z.array(otherLinkSchema).optional(),
});

const buildMilestoneSchema = z.object({
  title: z.string(),
  description: z.string().max(CHARACTER_LIMITS.milestoneDescription.max),
  deliverables: z.array(z.string()),
});

const growthMilestoneSchema = z.object({
  title: z.string(),
  description: z.string().max(CHARACTER_LIMITS.milestoneDescription.max),
  activations: z.array(z.string()),
});

const teamMemberSchema = z.object({
  name: z.string(),
  roleDescription: z.string(),
  telegram: z.string().optional(),
  githubOrLinkedin: z.string().optional(),
});

export const roundDetailsSchema = z.object({
  previousParticipation: z.object({
    hasParticipatedBefore: z.boolean().nullable(),
    numberOfRounds: z.string(),
    previousKarmaUpdates: z.string(),
    currentProjectState: z
      .string()
      .max(CHARACTER_LIMITS.currentProjectState.max),
  }),
  maturityAndUsage: z.object({
    projectStage: z.enum(["early", "live", "mature"]).nullable(),
    lifetimeUsers: z.string(),
    activeUsers: z.string(),
    activeUsersFrequency: z.enum(["daily", "weekly", "monthly"]),
    otherUsageData: z.string(),
  }),
  integration: z.object({
    status: z.enum(["live", "ready", "planned"]).nullable(),
    types: z.array(
      z.enum([
        "payments",
        "identity",
        "claimFlow",
        "goodCollective",
        "supertoken",
        "activityFees",
        "other",
      ]),
    ),
    otherTypeExplanation: z.string(),
    description: z.string().min(1),
  }),
  buildGoals: z.object({
    primaryBuildGoal: z.string(),
    milestones: z.array(buildMilestoneSchema),
    ecosystemImpact: z.string().max(CHARACTER_LIMITS.ecosystemImpact.max),
  }),
  growthGoals: z.object({
    primaryGrowthGoal: z.string(),
    targetUsers: z.string(),
    milestones: z.array(growthMilestoneSchema),
    ecosystemImpact: z.string().max(CHARACTER_LIMITS.ecosystemImpact.max),
  }),
  team: z.object({
    primaryContact: teamMemberSchema,
    additionalTeammates: z.array(teamMemberSchema),
  }),
  additional: z.object({
    comments: z.string(),
  }),
  attestation: z.any().optional(),
});

type ValidationSuccess<T> = { success: true; data: T };
type ValidationError = { success: false; error: string };
type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

type ProjectDetails = typeof projectDetailsSchema._output;

export function validateProjectDetails(
  data: unknown,
): ValidationResult<ProjectDetails> {
  const result = projectDetailsSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { success: false, error: issue.message };
  }
  return { success: true, data: result.data };
}

type RoundDetails = typeof roundDetailsSchema._output;

export function validateRoundDetails(
  data: unknown,
): ValidationResult<RoundDetails> {
  const result = roundDetailsSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { success: false, error: issue.message };
  }

  const details = result.data;

  if (details.previousParticipation.hasParticipatedBefore === true) {
    const len = details.previousParticipation.currentProjectState.length;
    if (len < CHARACTER_LIMITS.currentProjectState.min) {
      return {
        success: false,
        error: `Current project state must be at least ${CHARACTER_LIMITS.currentProjectState.min} characters`,
      };
    }
  }

  if (
    details.integration.types.includes("other") &&
    details.integration.otherTypeExplanation.trim() === ""
  ) {
    return {
      success: false,
      error: "Please explain the 'other' integration type",
    };
  }

  for (let i = 0; i < details.buildGoals.milestones.length; i++) {
    const desc = details.buildGoals.milestones[i].description;
    if (desc.length < CHARACTER_LIMITS.milestoneDescription.min) {
      return {
        success: false,
        error: `Build milestone ${i + 1} description must be at least ${CHARACTER_LIMITS.milestoneDescription.min} characters`,
      };
    }
  }

  for (let i = 0; i < details.growthGoals.milestones.length; i++) {
    const desc = details.growthGoals.milestones[i].description;
    if (desc.length < CHARACTER_LIMITS.milestoneDescription.min) {
      return {
        success: false,
        error: `Growth milestone ${i + 1} description must be at least ${CHARACTER_LIMITS.milestoneDescription.min} characters`,
      };
    }
  }

  return { success: true, data: details };
}
