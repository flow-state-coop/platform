import { describe, it, expect } from "vitest";
import {
  validateProjectDetails,
  validateProfile,
  validateReactionEmoji,
  validateDynamicRoundDetails,
  normalizeSocialHandle,
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

  it("normalizes twitter.com to x.com (allowed host)", () => {
    expect(
      normalizeSocialHandle("https://twitter.com/alice", "twitter"),
    ).toBe("https://twitter.com/alice");
  });

  it("extracts handle from a non-allowed host and rebuilds the URL", () => {
    expect(
      normalizeSocialHandle("https://facebook.com/alice", "twitter"),
    ).toBe("https://x.com/alice");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeSocialHandle("", "twitter")).toBe("");
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
