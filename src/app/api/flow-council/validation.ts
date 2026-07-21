import { z } from "zod";
import { isAddress } from "viem";
import {
  CHARACTER_LIMITS,
  MAX_MILESTONES,
} from "@/app/flow-councils/constants";
import { ALLOWED_REACTIONS } from "@/app/flow-councils/lib/constants";
import { STRUCTURAL_TYPES } from "@/app/flow-councils/types/formSchema";
import { normalizeUrl } from "@/app/flow-councils/utils/normalizeUrl";
import { isValidEmail } from "@/lib/email";
import {
  normalizeSocialHandle,
  extractSocialHandle,
} from "@/lib/socialHandles";
import {
  getEffectiveCharCount,
  X_CHAR_LIMIT,
  FARCASTER_CHAR_LIMIT,
  type SocialAccount,
} from "@/app/flow-councils/lib/socialShare";
import type {
  TeamMember,
  BuildMilestone,
  GrowthMilestone,
} from "@/app/flow-councils/types/round";

export { isValidEmail } from "@/lib/email";

export const MAX_STRING_LENGTH = 10_000;

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

export { normalizeSocialHandle, extractSocialHandle };

const socialAccountSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(50),
  xHandle: z.string().trim().max(50).optional(),
  farcasterHandle: z.string().trim().max(50).optional(),
});

export const socialConfigSchema = z.object({
  accounts: z
    .array(socialAccountSchema)
    .max(10)
    .refine(
      (accounts) =>
        new Set(accounts.map((account) => account.name.toLowerCase())).size ===
        accounts.length,
      { message: "Account names must be unique" },
    ),
  voteMessage: z.string().max(1000).optional(),
  donationMessage: z.string().max(1000).optional(),
  shareImageUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return ["http:", "https:"].includes(u.protocol);
        } catch {
          return false;
        }
      },
      { message: "shareImageUrl must be an http(s) URL" },
    )
    .optional()
    .or(z.literal("")),
});

type SocialConfig = z.infer<typeof socialConfigSchema>;

export function normalizeSocialConfig(
  social: SocialConfig,
  existingShareImageUrl: string | undefined,
) {
  return {
    ...social,
    shareImageUrl:
      social.shareImageUrl === undefined
        ? existingShareImageUrl
        : social.shareImageUrl,
    accounts: social.accounts.map((account) => {
      const xHandle = account.xHandle
        ? extractSocialHandle(account.xHandle, "twitter")
        : "";
      const farcasterHandle = account.farcasterHandle
        ? extractSocialHandle(account.farcasterHandle, "farcaster")
        : "";

      return {
        id: account.id,
        name: account.name,
        ...(xHandle ? { xHandle } : {}),
        ...(farcasterHandle ? { farcasterHandle } : {}),
      };
    }),
  };
}

export function validateSocialCharLimits(
  social: {
    voteMessage?: string;
    donationMessage?: string;
    accounts: SocialAccount[];
  },
  context: { roundName: string; roundLink: string },
): string | null {
  const shareContext = {
    roundName: context.roundName,
    roundLink: context.roundLink,
    accounts: social.accounts,
  };
  const messages = [
    { label: "Vote message", template: social.voteMessage },
    { label: "Donation message", template: social.donationMessage },
  ];
  const platforms = [
    { platform: "x", label: "X", limit: X_CHAR_LIMIT },
    { platform: "farcaster", label: "Farcaster", limit: FARCASTER_CHAR_LIMIT },
  ] as const;

  for (const { label, template } of messages) {
    if (!template?.trim()) continue;

    for (const { platform, label: platformLabel, limit } of platforms) {
      const count = getEffectiveCharCount(template, platform, shareContext);

      if (count > limit) {
        return `${label} exceeds the ${platformLabel} limit (${count}/${limit})`;
      }
    }
  }

  return null;
}

const evidenceLinkSchema = z.object({
  name: z.string().min(1).max(200),
  link: z
    .string()
    .max(2000)
    .transform(normalizeUrl)
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

// Single source of truth for what a valid milestone value looks like. Both
// write paths (full-application PUT via validateDynamicRoundDetails and the
// Milestones-tab PATCH) must use this so data saved through one path never
// becomes uneditable through the other.
//
// Descriptions are mandatory, but enforced as a ratchet: a description that is
// unchanged from what is already stored is accepted even if it violates the
// current rules (callers express this by validating with descriptionRequired:
// false and relaxed bounds). Anything the caller is actually changing must
// comply. This lets grantees fix legacy rows with empty descriptions without
// letting anyone blank a description or create a new milestone without one.
export function makeMilestoneDefinitionSchema(opts: {
  descriptionMinChars: number;
  descriptionMaxChars: number;
  descriptionRequired: boolean;
  itemLabel?: string;
}) {
  const itemLabel = opts.itemLabel ?? "Item";
  return z.object({
    title: z
      .string()
      .max(200, "Title exceeds 200 characters")
      .refine((title) => title.trim() !== "", "Title is required"),
    description: z
      .string()
      .min(
        opts.descriptionMinChars,
        `Description must be at least ${opts.descriptionMinChars} characters`,
      )
      .max(
        opts.descriptionMaxChars,
        `Description must be at most ${opts.descriptionMaxChars} characters`,
      )
      .refine(
        (description) => !opts.descriptionRequired || description.trim() !== "",
        {
          message: "Description is required",
        },
      ),
    items: z
      .array(z.string())
      .min(1, `At least one ${itemLabel} is required`)
      .max(50, `At most 50 ${itemLabel}s are allowed`)
      .superRefine((items, ctx) => {
        items.forEach((item, i) => {
          if (item.trim() === "") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${itemLabel} ${i + 1} is required`,
              path: [i],
            });
          } else if (item.length > 500) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${itemLabel} ${i + 1} exceeds 500 characters`,
              path: [i],
            });
          }
        });
      }),
  });
}

// Describes the stored counterpart of a submitted milestone so validation can
// tell edits from unchanged carry-overs. A stored entry without a string
// description counts as an empty one, matching how the milestones GET coerces
// it for clients.
export function getStoredMilestoneDescription(
  storedValue: unknown,
  index: number,
): string | undefined {
  if (!Array.isArray(storedValue)) return undefined;
  const stored = storedValue[index];
  if (!stored || typeof stored !== "object") return undefined;
  const description = (stored as { description?: unknown }).description;
  return typeof description === "string" ? description : "";
}

export const milestoneDefinitionSchema = makeMilestoneDefinitionSchema({
  descriptionMinChars: CHARACTER_LIMITS.milestoneDescription.min,
  descriptionMaxChars: CHARACTER_LIMITS.milestoneDescription.max,
  descriptionRequired: true,
});

// Chooses the schema for a single milestone definition write. Shared by the
// full-application validator and the Milestones-tab PATCH so the ratchet rule
// cannot drift between the two write paths: unchanged descriptions validate
// leniently, edited ones against the element's bounds (or the legacy bounds
// when there is no dynamic element).
export function pickMilestoneDefinitionSchema(
  element:
    | {
        descriptionMinChars?: number;
        descriptionMaxChars?: number;
        itemLabel?: string;
      }
    | undefined,
  descriptionUnchanged: boolean,
) {
  if (descriptionUnchanged) {
    return makeMilestoneDefinitionSchema({
      descriptionMinChars: 0,
      descriptionMaxChars: MAX_STRING_LENGTH,
      descriptionRequired: false,
      itemLabel: element?.itemLabel,
    });
  }
  if (!element) return milestoneDefinitionSchema;
  return makeMilestoneDefinitionSchema({
    descriptionMinChars: element.descriptionMinChars ?? 0,
    descriptionMaxChars: element.descriptionMaxChars ?? MAX_STRING_LENGTH,
    descriptionRequired: true,
    itemLabel: element.itemLabel,
  });
}

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

export const formElementSchema = z
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
      "milestone",
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
    milestoneLabel: z.string().max(100).optional(),
    itemLabel: z.enum(["Deliverable", "Activation"]).optional(),
    minCount: z.number().int().min(1).max(5).optional(),
    descriptionPlaceholder: z.string().max(500).optional(),
    descriptionMinChars: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_STRING_LENGTH)
      .optional(),
    descriptionMaxChars: z
      .number()
      .int()
      .positive()
      .max(MAX_STRING_LENGTH)
      .optional(),
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
  )
  .refine(
    (el) =>
      el.descriptionMinChars === undefined ||
      el.descriptionMaxChars === undefined ||
      el.descriptionMinChars <= el.descriptionMaxChars,
    { message: "descriptionMinChars must be ≤ descriptionMaxChars" },
  )
  .refine((el) => el.type !== "milestone" || el.required === true, {
    message: "milestone elements must have required: true",
  });

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

export type FormElement = z.infer<typeof formElementSchema>;

export const MAX_DETAILS_SIZE = 512_000; // 512 KB

type FieldValidator = (
  val: unknown,
  el: FormElement,
  storedVal?: unknown,
) => string | null;

function checkStringWithLimit(val: unknown, el: FormElement): string | null {
  if (typeof val !== "string") return `"${el.label}" must be text`;
  const limit = el.charLimit ?? MAX_STRING_LENGTH;
  if (val.length > limit) {
    return `"${el.label}" exceeds the ${limit} character limit`;
  }
  return null;
}

function checkTextWithMin(val: unknown, el: FormElement): string | null {
  const err = checkStringWithLimit(val, el);
  if (err) return err;
  const str = val as string;
  if (typeof el.minCharLimit === "number" && str.length < el.minCharLimit) {
    return `"${el.label}" must be at least ${el.minCharLimit} characters`;
  }
  return null;
}

const VALIDATORS: Partial<Record<FormElement["type"], FieldValidator>> = {
  text: checkTextWithMin,
  textarea: checkTextWithMin,
  telegram: checkStringWithLimit,
  email: (val, el) => {
    const err = checkStringWithLimit(val, el);
    if (err) return err;
    return isValidEmail(val as string)
      ? null
      : `"${el.label}" must be a valid email address`;
  },
  ethAddress: (val, el) =>
    typeof val !== "string" || !isAddress(val)
      ? `"${el.label}" must be a valid Ethereum address`
      : null,
  url: (val, el) => {
    const err = checkStringWithLimit(val, el);
    if (err) return err;
    try {
      const parsed = new URL(val as string);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return `"${el.label}" must be an http(s) URL`;
      }
    } catch {
      return `"${el.label}" must be a valid URL`;
    }
    return null;
  },
  number: (val, el) => {
    if (typeof val !== "number" && typeof val !== "string") {
      return `"${el.label}" must be a number`;
    }
    const num = Number(val);
    if (isNaN(num)) return `"${el.label}" must be a number`;
    if (el.min !== undefined && num < el.min) {
      return `"${el.label}" must be at least ${el.min}`;
    }
    if (el.max !== undefined && num > el.max) {
      return `"${el.label}" must be at most ${el.max}`;
    }
    return null;
  },
  select: (val, el) =>
    typeof val !== "string" || !el.options?.includes(val)
      ? `"${el.label}" has an invalid selection`
      : null,
  multiSelect: (val, el) =>
    !Array.isArray(val) ||
    val.some((v: unknown) => typeof v !== "string" || !el.options?.includes(v))
      ? `"${el.label}" has an invalid selection`
      : null,
  boolean: (val, el) =>
    typeof val !== "boolean" ? `"${el.label}" must be true or false` : null,
  milestone: (val, el, storedVal) => {
    const minCount = el.minCount ?? 1;
    const milestoneLabel = el.milestoneLabel || el.label || "Milestone";
    if (!Array.isArray(val)) {
      return `"${el.label}" must be a list of milestones`;
    }
    if (val.length < minCount) {
      return `"${el.label}" requires at least ${minCount} milestone${minCount === 1 ? "" : "s"}`;
    }
    if (val.length > MAX_MILESTONES) {
      return `"${el.label}" allows at most ${MAX_MILESTONES} milestones`;
    }
    // Grandfathering is a multiset over the stored descriptions, not an
    // index-by-index comparison: each stored description covers one incoming
    // milestone, so removing or reordering milestones never re-triggers
    // validation on descriptions the caller didn't touch, and net-new
    // milestones cannot inherit another row's exemption.
    const storedDescriptionCounts = new Map<string, number>();
    if (Array.isArray(storedVal)) {
      for (let i = 0; i < storedVal.length; i++) {
        const stored = getStoredMilestoneDescription(storedVal, i);
        if (stored !== undefined) {
          storedDescriptionCounts.set(
            stored,
            (storedDescriptionCounts.get(stored) ?? 0) + 1,
          );
        }
      }
    }
    for (let i = 0; i < val.length; i++) {
      const entry = val[i] as { description?: unknown } | null;
      const description =
        typeof entry?.description === "string" ? entry.description : undefined;
      const remaining =
        description !== undefined
          ? (storedDescriptionCounts.get(description) ?? 0)
          : 0;
      const descriptionUnchanged = remaining > 0;
      if (descriptionUnchanged && description !== undefined) {
        storedDescriptionCounts.set(description, remaining - 1);
      }
      const schema = pickMilestoneDefinitionSchema(el, descriptionUnchanged);
      const parsed = schema.safeParse(val[i]);
      if (!parsed.success) {
        return `${milestoneLabel} ${i + 1}: ${parsed.error.issues[0].message}`;
      }
    }
    return null;
  },
};

function validateFormSection(
  values: Record<string, unknown>,
  formElements: FormElement[],
  sectionLabel: string,
  storedValues?: Record<string, unknown>,
): ValidationResult<Record<string, unknown>> {
  const allowedIds = new Set<string>();

  for (const el of formElements) {
    if (STRUCTURAL_TYPES.has(el.type)) continue;
    allowedIds.add(el.id);

    const val = values[el.id];

    if (el.required) {
      if (val === undefined || val === null || val === "") {
        return { success: false, error: `"${el.label}" is required` };
      }
      if (
        (el.type === "multiSelect" || el.type === "milestone") &&
        Array.isArray(val) &&
        val.length === 0
      ) {
        return { success: false, error: `"${el.label}" is required` };
      }
    }

    if (val === undefined || val === null || val === "") continue;

    const validator = VALIDATORS[el.type];
    if (validator) {
      const err = validator(val, el, storedValues?.[el.id]);
      if (err) return { success: false, error: err };
    }
  }

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

// storedData is the same section object from the application row currently in
// the database (if any); it lets milestone validation grandfather unchanged
// descriptions instead of rejecting rows the caller never touched.
export function validateDynamicRoundDetails(
  data: Record<string, unknown>,
  formElements: FormElement[],
  storedData?: Record<string, unknown>,
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
    storedData,
  );
}

export function validateDynamicAttestationDetails(
  data: Record<string, unknown>,
  formElements: FormElement[],
  storedData?: Record<string, unknown>,
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
    storedData,
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
    .refine((val) => !val || isValidEmail(val), "Invalid email"),
  telegram: z.string().trim().max(255).optional().or(z.literal("")),
  consentConfirmedAt: z.string().datetime().nullable().optional(),
  consentVersion: z.string().max(20).nullable().optional(),
  notifyApplicationEligibility: z.boolean().optional(),
  notifyProjectChannels: z.boolean().optional(),
  notifyRoundAnnouncements: z.boolean().optional(),
  notifyInternalReview: z.boolean().optional(),
  notifyPlatform: z.boolean().optional(),
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

export function parseAddressParam(value: string | null): string | undefined {
  return value && isAddress(value) ? value : undefined;
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

// ---------------------------------------------------------------------------
// Voter group schemas
// Spec: POST /api/flow-council/voter-groups — create a new group
//       PATCH /api/flow-council/voter-groups — update group metadata (all fields optional)
// ---------------------------------------------------------------------------

const MAX_UINT256 = 2n ** 256n - 1n;

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const nftContractAddressSchema = z
  .string()
  .refine(isAddress, "Invalid contract address")
  .transform((value) => value.toLowerCase());

// The token id is half of the (council, collection, token id) uniqueness rule,
// so it is stored as a canonical decimal string: "007" and "7" must not both be
// storable, and a uint256 does not survive a JS number.
const nftTokenIdSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9]\d*)$/, "Token id must be a canonical decimal integer")
  .refine((value) => BigInt(value) <= MAX_UINT256, "Token id exceeds uint256");

const nftAcquisitionUrlSchema = z
  .string()
  .max(2048)
  .refine(isHttpUrl, "Link must be an http or https URL");

const nftCollectionNameSchema = z.string().max(100);

// Spec: "If it's an ERC-1155, a token ID field appears and is required."
// A 721 group has no token id to distinguish it (Out of scope: "Multiple tiers
// on a single ERC-721 collection"), so carrying one is a configuration error.
export const nftConfigSchema = z.discriminatedUnion("tokenStandard", [
  z.object({
    tokenStandard: z.literal("erc721"),
    contractAddress: nftContractAddressSchema,
    tokenId: z.undefined(),
    acquisitionUrl: nftAcquisitionUrlSchema.optional(),
    collectionName: nftCollectionNameSchema.optional(),
  }),
  z.object({
    tokenStandard: z.literal("erc1155"),
    contractAddress: nftContractAddressSchema,
    tokenId: nftTokenIdSchema,
    acquisitionUrl: nftAcquisitionUrlSchema.optional(),
    collectionName: nftCollectionNameSchema.optional(),
  }),
]);

export type NftConfig = z.infer<typeof nftConfigSchema>;

// Spec: "name" 1–100 chars; "eligibilityMethod" enum ["manual","gooddollar","metrics","nft"];
//       "defaultVotingPower" integer 1–1_000_000
export const voterGroupCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    eligibilityMethod: z.enum(["manual", "gooddollar", "metrics", "nft"]),
    defaultVotingPower: z.number().int().min(1).max(1_000_000),
    nftConfig: nftConfigSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.eligibilityMethod === "nft" && !value.nftConfig) {
      ctx.addIssue({
        code: "custom",
        path: ["nftConfig"],
        message: "An NFT Holder group needs a collection configuration",
      });
    }

    if (value.eligibilityMethod !== "nft" && value.nftConfig) {
      ctx.addIssue({
        code: "custom",
        path: ["nftConfig"],
        message:
          "Only an NFT Holder group can carry a collection configuration",
      });
    }
  });

// Spec: PATCH — partial update; each field still validated when present.
// The nft config is optional as a whole object and never per-field: a partial
// merge is what leaves a group matching nobody (criterion 4). Whether the
// resulting group is an nft group depends on the stored row, so completeness
// for the resulting method is enforced by the route, not here.
export const voterGroupUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  eligibilityMethod: z
    .enum(["manual", "gooddollar", "metrics", "nft"])
    .optional(),
  defaultVotingPower: z.number().int().min(1).max(1_000_000).optional(),
  nftConfig: nftConfigSchema.optional(),
});

// ---------------------------------------------------------------------------
// Metrics voter group schemas
// A "metrics" group adds the Flow State bot as an on-chain voter; an external
// caller pushes ballots via POST /api/flow-council/metrics/ballot (Bearer key)
// and admins mint keys via POST /api/flow-council/metrics/keys (SIWE).
// ---------------------------------------------------------------------------

// Per-recipient relative weights — the server normalizes these to the bot's
// current on-chain voting power, so the caller never tracks governance config.
const MAX_METRICS_BALLOT_ENTRIES = 1000;

export const metricsBallotSchema = z.object({
  votes: z
    .array(
      z.object({
        recipient: z.string().refine(isAddress, "Invalid recipient address"),
        weight: z.number().finite().nonnegative(),
      }),
    )
    .min(1)
    .max(MAX_METRICS_BALLOT_ENTRIES)
    .refine((votes) => votes.some((v) => v.weight > 0), {
      message: "At least one recipient must have a positive weight",
    })
    .refine(
      (votes) =>
        new Set(votes.map((v) => v.recipient.toLowerCase())).size ===
        votes.length,
      { message: "Duplicate recipient addresses are not allowed" },
    ),
});

export const metricsKeyCreateSchema = z.object({
  label: z.string().min(1).max(100),
});
