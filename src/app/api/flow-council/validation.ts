import { z } from "zod";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";
import { ALLOWED_REACTIONS } from "@/app/flow-councils/lib/constants";
import type {
  TeamMember,
  BuildMilestone,
  GrowthMilestone,
} from "@/app/flow-councils/types/round";

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
  gardensPool: z.string().optional(),
  githubRepos: z
    .array(
      z.string().refine(
        (url) => {
          if (!url) return true;
          const normalized = url.replace(/\/+$/, "");
          return (
            /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(normalized) &&
            !normalized.endsWith(".git")
          );
        },
        {
          message:
            "Must be in https://github.com/orgname/reponame format without .git suffix",
        },
      ),
    )
    .optional(),
  smartContracts: z.array(smartContractSchema).optional(),
  otherLinks: z.array(otherLinkSchema).optional(),
});

const buildMilestoneSchema: z.ZodType<BuildMilestone> = z.object({
  title: z.string(),
  description: z.string().max(CHARACTER_LIMITS.milestoneDescription.max),
  deliverables: z.array(z.string()),
});

const growthMilestoneSchema: z.ZodType<GrowthMilestone> = z.object({
  title: z.string(),
  description: z.string().max(CHARACTER_LIMITS.milestoneDescription.max),
  activations: z.array(z.string()),
});

const teamMemberSchema: z.ZodType<TeamMember> = z.object({
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

const SOCIAL_BASE_URLS: Record<string, string> = {
  twitter: "https://x.com",
  github: "https://github.com",
  linkedin: "https://linkedin.com/in",
  farcaster: "https://farcaster.xyz",
  telegram: "https://t.me",
};

const SOCIAL_ALLOWED_HOSTS: Record<string, string[]> = {
  twitter: ["x.com", "twitter.com"],
  github: ["github.com"],
  linkedin: ["linkedin.com"],
  farcaster: ["warpcast.com", "farcaster.xyz"],
  telegram: ["t.me"],
};

export function normalizeSocialHandle(
  raw: string,
  platform: keyof typeof SOCIAL_BASE_URLS,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }
      const host = url.hostname.replace(/^www\./, "");
      const allowed = SOCIAL_ALLOWED_HOSTS[platform] ?? [];
      if (allowed.includes(host)) {
        return `https://${host}${url.pathname}${url.search}`;
      }
      // Not an allowed host — fall through to treat the last path segment as a handle
      const lastSegment = url.pathname.split("/").filter(Boolean).pop();
      if (!lastSegment) return "";
      const handle = lastSegment.replace(/^@/, "");
      return `${SOCIAL_BASE_URLS[platform]}/${encodeURIComponent(handle)}`;
    } catch {
      return "";
    }
  }

  const handle = trimmed.replace(/^@/, "");
  return `${SOCIAL_BASE_URLS[platform]}/${encodeURIComponent(handle)}`;
}

export function normalizeEvidenceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

const evidenceLinkSchema = z.object({
  name: z.string().min(1).max(200),
  link: z
    .string()
    .max(2000)
    .transform(normalizeEvidenceUrl)
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return ["http:", "https:"].includes(parsed.protocol);
        } catch {
          return false;
        }
      },
      { message: "Invalid URL" },
    ),
});

const deliverableProgressSchema = z.object({
  completion: z.number().int().min(0).max(100),
  evidence: z.array(evidenceLinkSchema).max(20),
});

export const milestoneProgressSchema = z.object({
  otherDetails: z.string().max(5000),
  items: z.array(deliverableProgressSchema),
});

export const milestoneDefinitionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z
    .string()
    .min(
      CHARACTER_LIMITS.milestoneDescription.min,
      `Description must be at least ${CHARACTER_LIMITS.milestoneDescription.min} characters`,
    )
    .max(CHARACTER_LIMITS.milestoneDescription.max),
  items: z
    .array(z.string())
    .refine((items) => items.some((item) => item.trim() !== ""), {
      message: "At least one item is required",
    }),
});

export const reactionEmojiSchema = z.enum(ALLOWED_REACTIONS);

const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(
    /^[\p{L}\p{N}\s\-_]+$/u,
    "Only letters, numbers, spaces, hyphens, and underscores",
  );

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

const formElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "section",
      "description",
      "text",
      "textarea",
      "number",
      "url",
      "email",
      "select",
      "multiSelect",
      "boolean",
      "telegram",
      "ethAddress",
      "divider",
    ]),
    label: z.string().max(500),
    content: z.string().max(5000).optional(),
    required: z.boolean().optional(),
    placeholder: z.string().max(500).optional(),
    charLimit: z.number().int().positive().optional(),
    minCharLimit: z.number().int().nonnegative().optional(),
    markdown: z.boolean().optional(),
    baseUrl: z.string().max(500).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z.array(z.string().max(200)).max(50).optional(),
  })
  .refine(
    (el) =>
      el.type === "description" ||
      el.type === "divider" ||
      el.label.length >= 1,
    { message: "label is required for non-description/divider elements" },
  )
  .refine(
    (el) =>
      (el.type !== "select" && el.type !== "multiSelect") ||
      (Array.isArray(el.options) && el.options.length > 0),
    { message: "select and multiSelect require at least one option" },
  );

const formSchemaSchema = z.object({
  round: z.array(formElementSchema).max(100),
  attestation: z.array(formElementSchema).max(100),
});

type FormSchemaData = typeof formSchemaSchema._output;

export function validateFormSchema(
  data: unknown,
): ValidationResult<FormSchemaData> {
  const result = formSchemaSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { success: false, error: issue.message };
  }
  return { success: true, data: result.data };
}

type FormElement = z.infer<typeof formElementSchema>;

const STRUCTURAL_TYPES = new Set(["section", "description", "divider"]);
const MAX_STRING_LENGTH = 10_000;
export const MAX_DETAILS_SIZE = 512_000; // 512 KB

function validateFormSection(
  values: Record<string, unknown>,
  formElements: FormElement[],
  sectionLabel: string,
): ValidationResult<Record<string, unknown>> {
  const allowedIds = new Set<string>();

  for (const el of formElements) {
    if (STRUCTURAL_TYPES.has(el.type)) continue;
    allowedIds.add(el.id);

    const val = values[el.id];

    if (el.required) {
      if (val === undefined || val === null || val === "") {
        return {
          success: false,
          error: `"${el.label}" is required`,
        };
      }
      if (el.type === "multiSelect" && Array.isArray(val) && val.length === 0) {
        return {
          success: false,
          error: `"${el.label}" is required`,
        };
      }
    }

    // Skip type checks for empty optional fields
    if (val === undefined || val === null || val === "") continue;

    switch (el.type) {
      case "text":
      case "textarea":
      case "email":
      case "telegram": {
        if (typeof val !== "string") {
          return {
            success: false,
            error: `"${el.label}" must be text`,
          };
        }
        const limit = el.charLimit ?? MAX_STRING_LENGTH;
        if (val.length > limit) {
          return {
            success: false,
            error: `"${el.label}" exceeds the ${limit} character limit`,
          };
        }
        break;
      }
      case "url": {
        if (typeof val !== "string") {
          return {
            success: false,
            error: `"${el.label}" must be text`,
          };
        }
        const limit = el.charLimit ?? MAX_STRING_LENGTH;
        if (val.length > limit) {
          return {
            success: false,
            error: `"${el.label}" exceeds the ${limit} character limit`,
          };
        }
        try {
          const parsed = new URL(val);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            return {
              success: false,
              error: `"${el.label}" must be an http(s) URL`,
            };
          }
        } catch {
          return {
            success: false,
            error: `"${el.label}" must be a valid URL`,
          };
        }
        break;
      }
      case "number":
        if (typeof val !== "number" && typeof val !== "string") {
          return {
            success: false,
            error: `"${el.label}" must be a number`,
          };
        }
        {
          const num = Number(val);
          if (isNaN(num)) {
            return {
              success: false,
              error: `"${el.label}" must be a number`,
            };
          }
          if (el.min !== undefined && num < el.min) {
            return {
              success: false,
              error: `"${el.label}" must be at least ${el.min}`,
            };
          }
          if (el.max !== undefined && num > el.max) {
            return {
              success: false,
              error: `"${el.label}" must be at most ${el.max}`,
            };
          }
        }
        break;
      case "select":
        if (typeof val !== "string" || !el.options?.includes(val)) {
          return {
            success: false,
            error: `"${el.label}" has an invalid selection`,
          };
        }
        break;
      case "multiSelect":
        if (
          !Array.isArray(val) ||
          val.some(
            (v: unknown) => typeof v !== "string" || !el.options?.includes(v),
          )
        ) {
          return {
            success: false,
            error: `"${el.label}" has an invalid selection`,
          };
        }
        break;
      case "boolean":
        if (typeof val !== "boolean") {
          return {
            success: false,
            error: `"${el.label}" must be true or false`,
          };
        }
        break;
    }
  }

  // Strip unknown keys
  for (const key of Object.keys(values)) {
    if (!allowedIds.has(key)) {
      return {
        success: false,
        error: `Unknown field "${key}" in ${sectionLabel}`,
      };
    }
  }

  return { success: true, data: values };
}

export function validateDynamicRoundDetails(
  data: Record<string, unknown>,
  formElements: FormElement[],
): ValidationResult<Record<string, unknown>> {
  if (JSON.stringify(data).length > MAX_DETAILS_SIZE) {
    return { success: false, error: "Payload too large" };
  }

  const values = data.round;
  if (typeof values !== "object" || values === null) {
    return { success: false, error: "Missing round data" };
  }

  return validateFormSection(
    values as Record<string, unknown>,
    formElements,
    "round",
  );
}

export function validateDynamicAttestationDetails(
  data: Record<string, unknown>,
  formElements: FormElement[],
): ValidationResult<Record<string, unknown>> {
  if (JSON.stringify(data).length > MAX_DETAILS_SIZE) {
    return { success: false, error: "Payload too large" };
  }

  const values = data.attestation;
  if (typeof values !== "object" || values === null) {
    return { success: false, error: "Missing attestation data" };
  }

  return validateFormSection(
    values as Record<string, unknown>,
    formElements,
    "attestation",
  );
}

export const profileSchema = z.object({
  displayName: displayNameSchema,
  bio: z.string().trim().max(300).optional().or(z.literal("")),
  twitter: z.string().trim().max(255).optional().or(z.literal("")),
  github: z.string().trim().max(255).optional().or(z.literal("")),
  linkedin: z.string().trim().max(255).optional().or(z.literal("")),
  farcaster: z.string().trim().max(255).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal(""))
    .refine(
      (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      "Invalid email",
    ),
  telegram: z.string().trim().max(255).optional().or(z.literal("")),
});

type ProfileData = typeof profileSchema._output;

export function validateProfile(data: unknown): ValidationResult<ProfileData> {
  const result = profileSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { success: false, error: issue.message };
  }
  return { success: true, data: result.data };
}

export function validateReactionEmoji(
  data: unknown,
): ValidationResult<(typeof ALLOWED_REACTIONS)[number]> {
  const result = reactionEmojiSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: "Invalid reaction emoji" };
  }
  return { success: true, data: result.data };
}
