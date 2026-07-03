import { describe, it, expect } from "vitest";
import {
  validateProjectDetails,
  validateProfile,
  validateReactionEmoji,
  validateDynamicRoundDetails,
  normalizeSocialHandle,
  extractSocialHandle,
  socialConfigSchema,
  MAX_DETAILS_SIZE,
} from "./validation";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";
import { ALLOWED_REACTIONS } from "@/app/flow-councils/lib/constants";

const MIN_DESCRIPTION = "x".repeat(CHARACTER_LIMITS.projectDescription.min);

describe("validateProjectDetails", () => {
  it("accepts a minimal valid payload", () => {
    const result = validateProjectDetails({
      name: "Proj",
      description: MIN_DESCRIPTION,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = validateProjectDetails({ description: MIN_DESCRIPTION });
    expect(result.success).toBe(false);
  });

  it("rejects description below minimum length", () => {
    const result = validateProjectDetails({
      name: "Proj",
      description: "too short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed github repo URL", () => {
    const result = validateProjectDetails({
      name: "Proj",
      description: MIN_DESCRIPTION,
      githubRepos: ["github.com/foo/bar"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects github repo URL with .git suffix", () => {
    const result = validateProjectDetails({
      name: "Proj",
      description: MIN_DESCRIPTION,
      githubRepos: ["https://github.com/foo/bar.git"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid github repo URL", () => {
    const result = validateProjectDetails({
      name: "Proj",
      description: MIN_DESCRIPTION,
      githubRepos: ["https://github.com/foo/bar"],
    });
    expect(result.success).toBe(true);
  });
});

describe("validateProfile", () => {
  it("accepts a profile with a valid displayName", () => {
    const result = validateProfile({ displayName: "alice" });
    expect(result.success).toBe(true);
  });

  it("rejects displayName with special characters", () => {
    const result = validateProfile({ displayName: "foo<bar" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = validateProfile({
      displayName: "alice",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty optional email", () => {
    const result = validateProfile({ displayName: "alice", email: "" });
    expect(result.success).toBe(true);
  });
});

describe("validateReactionEmoji", () => {
  it("accepts a value from ALLOWED_REACTIONS", () => {
    const result = validateReactionEmoji(ALLOWED_REACTIONS[0]);
    expect(result.success).toBe(true);
  });

  it("rejects an arbitrary string", () => {
    const result = validateReactionEmoji("not-an-emoji");
    expect(result.success).toBe(false);
  });
});

describe("normalizeSocialHandle", () => {
  it("converts a bare handle to a canonical twitter URL", () => {
    expect(normalizeSocialHandle("alice", "twitter")).toBe(
      "https://x.com/alice",
    );
  });

  it("preserves a full canonical twitter URL", () => {
    expect(normalizeSocialHandle("https://x.com/alice", "twitter")).toBe(
      "https://x.com/alice",
    );
  });

  it("strips tracking query params", () => {
    expect(
      normalizeSocialHandle("https://x.com/alice?ref=foo", "twitter"),
    ).toBe("https://x.com/alice");
  });

  it("preserves twitter.com as an allowed host", () => {
    expect(normalizeSocialHandle("https://twitter.com/alice", "twitter")).toBe(
      "https://twitter.com/alice",
    );
  });

  it("extracts handle from a non-allowed host and rebuilds the URL", () => {
    expect(normalizeSocialHandle("https://facebook.com/alice", "twitter")).toBe(
      "https://x.com/alice",
    );
  });

  it("returns empty string for empty input", () => {
    expect(normalizeSocialHandle("", "twitter")).toBe("");
  });
});

// Spec (.claude/specs/social-share-tab.md): "Handle fields accept a pasted
// profile URL or a bare handle and normalize either (reusing the platform's
// existing handle normalization)." The stored form is the bare handle, no "@".

describe("extractSocialHandle", () => {
  it("returns a bare handle unchanged", () => {
    expect(extractSocialHandle("alice", "twitter")).toBe("alice");
  });

  it("strips a leading @ from a handle", () => {
    expect(extractSocialHandle("@alice", "twitter")).toBe("alice");
  });

  it("extracts the bare handle from a pasted profile URL with tracking params", () => {
    expect(extractSocialHandle("https://x.com/alice?ref=foo", "twitter")).toBe(
      "alice",
    );
  });

  it("extracts the bare handle from a twitter.com URL", () => {
    expect(extractSocialHandle("https://twitter.com/alice", "twitter")).toBe(
      "alice",
    );
  });

  it("extracts the bare handle from a warpcast.com URL for farcaster", () => {
    expect(extractSocialHandle("https://warpcast.com/bob", "farcaster")).toBe(
      "bob",
    );
  });

  it("returns empty string for empty input", () => {
    expect(extractSocialHandle("", "twitter")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(extractSocialHandle("   ", "farcaster")).toBe("");
  });
});

// Spec: "Up to 10 accounts per round."; mention tokens are keyed by account
// name, so names must be unique per round (case-insensitive). Message
// templates are capped at 1000 chars raw (per-platform resolved limits are
// enforced separately in the PATCH route). shareImageUrl is an http(s) URL
// or "" (empty removes the image).

describe("socialConfigSchema", () => {
  const account = (name: string, extra: Record<string, unknown> = {}) => ({
    id: `id-${name}`,
    name,
    ...extra,
  });

  const validConfig = {
    accounts: [
      account("Octant", { xHandle: "octantapp", farcasterHandle: "octant" }),
    ],
    voteMessage: "Voted with @[Octant] in {round name}! {round link}",
    donationMessage: "Streaming to {round name} {round link}",
    shareImageUrl: "https://example.com/share.png",
  };

  it("accepts a valid config", () => {
    expect(socialConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it("accepts an empty accounts list", () => {
    expect(socialConfigSchema.safeParse({ accounts: [] }).success).toBe(true);
  });

  it("accepts exactly 10 accounts", () => {
    const accounts = Array.from({ length: 10 }, (_, i) => account(`Team${i}`));
    expect(socialConfigSchema.safeParse({ accounts }).success).toBe(true);
  });

  it("rejects 11 accounts", () => {
    const accounts = Array.from({ length: 11 }, (_, i) => account(`Team${i}`));
    expect(socialConfigSchema.safeParse({ accounts }).success).toBe(false);
  });

  it("rejects duplicate account names differing only by case", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [account("Octant"), account("octant")],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an account with an empty name", () => {
    expect(
      socialConfigSchema.safeParse({ accounts: [account("")] }).success,
    ).toBe(false);
  });

  it("rejects an account name over 50 characters", () => {
    expect(
      socialConfigSchema.safeParse({ accounts: [account("x".repeat(51))] })
        .success,
    ).toBe(false);
  });

  it("accepts a message template of exactly 1000 characters", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [],
      voteMessage: "x".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a vote message template over 1000 characters", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [],
      voteMessage: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a donation message template over 1000 characters", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [],
      donationMessage: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts an https shareImageUrl", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [],
      shareImageUrl: "https://example.com/a.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty shareImageUrl", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [],
      shareImageUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-http(s) shareImageUrl", () => {
    const result = socialConfigSchema.safeParse({
      accounts: [],
      shareImageUrl: "ftp://example.com/a.png",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateDynamicRoundDetails", () => {
  const formElements = [
    {
      id: "name",
      type: "text" as const,
      label: "Name",
      required: true,
    },
    {
      id: "homepage",
      type: "url" as const,
      label: "Homepage",
    },
  ];

  it("accepts a valid payload", () => {
    const result = validateDynamicRoundDetails(
      { round: { name: "Proj", homepage: "https://example.com" } },
      formElements,
    );
    expect(result.success).toBe(true);
  });

  it("rejects missing required field", () => {
    const result = validateDynamicRoundDetails(
      { round: { homepage: "https://example.com" } },
      formElements,
    );
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL", () => {
    const result = validateDynamicRoundDetails(
      { round: { name: "Proj", homepage: "not a url" } },
      formElements,
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown field", () => {
    const result = validateDynamicRoundDetails(
      { round: { name: "Proj", rogue: "extra" } },
      formElements,
    );
    expect(result.success).toBe(false);
  });

  it("rejects payload exceeding MAX_DETAILS_SIZE", () => {
    const huge = "x".repeat(MAX_DETAILS_SIZE);
    const result = validateDynamicRoundDetails(
      { round: { name: huge } },
      formElements,
    );
    expect(result.success).toBe(false);
  });

  it("rejects missing round key", () => {
    const result = validateDynamicRoundDetails({}, formElements);
    expect(result.success).toBe(false);
  });
});
