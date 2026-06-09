import { describe, it, expect } from "vitest";
import { voterGroupCreateSchema, voterGroupUpdateSchema } from "./validation";

// Spec: POST /api/flow-council/voter-groups body validation
// Impl-plan Task 2: "Validate with Zod: name 1–100 chars, eligibilityMethod enum
//   ['manual','gooddollar'], defaultVotingPower integer 1–1e6"
// Spec: PATCH — partial update; each field still validated when present

// ---------------------------------------------------------------------------
// voterGroupCreateSchema
// ---------------------------------------------------------------------------

describe("voterGroupCreateSchema", () => {
  const validPayload = {
    name: "GoodDollar Holders",
    eligibilityMethod: "manual" as const,
    defaultVotingPower: 10,
  };

  describe("happy path", () => {
    it("accepts a minimal valid payload", () => {
      expect(voterGroupCreateSchema.safeParse(validPayload).success).toBe(true);
    });

    it("accepts eligibilityMethod 'gooddollar'", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "gooddollar",
      });
      expect(result.success).toBe(true);
    });

    it("accepts defaultVotingPower of 1 (minimum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts defaultVotingPower of 1_000_000 (maximum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a name of exactly 1 character (minimum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "A",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a name of exactly 100 characters (maximum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("name validation", () => {
    it("rejects an empty name", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a name of 101 characters (one over the maximum)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing name field", () => {
      const rest = {
        eligibilityMethod: validPayload.eligibilityMethod,
        defaultVotingPower: validPayload.defaultVotingPower,
      };
      const result = voterGroupCreateSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("eligibilityMethod validation", () => {
    it("rejects an unknown eligibility method string", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "nft",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an empty string for eligibilityMethod", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'GoodDollar' (wrong casing)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "GoodDollar",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'Manual' (wrong casing)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "Manual",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing eligibilityMethod field", () => {
      const rest = {
        name: validPayload.name,
        defaultVotingPower: validPayload.defaultVotingPower,
      };
      const result = voterGroupCreateSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("defaultVotingPower validation", () => {
    it("rejects 0 (below minimum of 1)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a negative value", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects 1_000_001 (above maximum of 1_000_000)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1_000_001,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer float (1.5)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a string representation of a number", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: "10",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing defaultVotingPower field", () => {
      const rest = {
        name: validPayload.name,
        eligibilityMethod: validPayload.eligibilityMethod,
      };
      const result = voterGroupCreateSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// voterGroupUpdateSchema
// ---------------------------------------------------------------------------

// Spec: PATCH — partial update; all three fields optional but still validated when present

describe("voterGroupUpdateSchema", () => {
  describe("happy path", () => {
    it("accepts an empty object (all fields optional)", () => {
      expect(voterGroupUpdateSchema.safeParse({}).success).toBe(true);
    });

    it("accepts name-only update", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ name: "Renamed" }).success,
      ).toBe(true);
    });

    it("accepts eligibilityMethod-only update to 'gooddollar'", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "gooddollar" })
          .success,
      ).toBe(true);
    });

    it("accepts eligibilityMethod-only update to 'manual'", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "manual" })
          .success,
      ).toBe(true);
    });

    it("accepts defaultVotingPower-only update", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 50 }).success,
      ).toBe(true);
    });

    it("accepts all three fields together", () => {
      expect(
        voterGroupUpdateSchema.safeParse({
          name: "Updated",
          eligibilityMethod: "gooddollar",
          defaultVotingPower: 100,
        }).success,
      ).toBe(true);
    });
  });

  describe("name still validated when present", () => {
    it("rejects empty name when name is provided", () => {
      expect(voterGroupUpdateSchema.safeParse({ name: "" }).success).toBe(
        false,
      );
    });

    it("rejects name longer than 100 chars when name is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ name: "x".repeat(101) }).success,
      ).toBe(false);
    });
  });

  describe("eligibilityMethod still validated when present", () => {
    it("rejects unknown method when eligibilityMethod is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "nft" }).success,
      ).toBe(false);
    });
  });

  describe("defaultVotingPower still validated when present", () => {
    it("rejects 0 when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 0 }).success,
      ).toBe(false);
    });

    it("rejects a negative value when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: -5 }).success,
      ).toBe(false);
    });

    it("rejects 1_000_001 when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 1_000_001 })
          .success,
      ).toBe(false);
    });

    it("rejects a non-integer when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 2.5 }).success,
      ).toBe(false);
    });
  });
});
