import { describe, it, expect } from "vitest";
import {
  getMilestoneCounts,
  getMilestoneTypes,
  parseMilestoneSources,
} from "./milestoneSources";

const MILESTONE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const roundSchema = [
  { id: "q1", type: "text" },
  { id: MILESTONE_ID, type: "milestone" },
];

describe("getMilestoneTypes", () => {
  it("returns the round schema's milestone element ids for dynamic forms", () => {
    expect(getMilestoneTypes(true, roundSchema)).toEqual([MILESTONE_ID]);
  });

  it("returns the fixed goal arrays for legacy forms", () => {
    expect(getMilestoneTypes(false, roundSchema)).toEqual(["build", "growth"]);
  });

  it("falls back to the Minimal template when the schema is missing", () => {
    expect(getMilestoneTypes(true, undefined)).toEqual([]);
  });
});

describe("getMilestoneCounts", () => {
  it("counts dynamic milestones under their element id", () => {
    const details = { round: { [MILESTONE_ID]: [{}, {}, {}] } };
    expect(getMilestoneCounts(details, true, [MILESTONE_ID])).toEqual({
      [MILESTONE_ID]: 3,
    });
  });

  it("counts legacy build and growth milestones", () => {
    const details = {
      buildGoals: { milestones: [{}, {}] },
      growthGoals: { milestones: [{}] },
    };
    expect(getMilestoneCounts(details, false, ["build", "growth"])).toEqual({
      build: 2,
      growth: 1,
    });
  });

  it("omits types the details do not carry", () => {
    expect(getMilestoneCounts({ round: {} }, true, [MILESTONE_ID])).toEqual({});
    expect(getMilestoneCounts(undefined, false, ["build", "growth"])).toEqual(
      {},
    );
  });
});

describe("parseMilestoneSources", () => {
  const stored = { [MILESTONE_ID]: 3 };

  it("treats a missing map as no provenance", () => {
    expect(parseMilestoneSources(undefined, stored, stored)).toEqual({
      success: true,
      sources: {},
    });
  });

  it("accepts a deletion that drops the middle milestone", () => {
    const result = parseMilestoneSources({ [MILESTONE_ID]: [0, 2] }, stored, {
      [MILESTONE_ID]: 2,
    });
    expect(result).toEqual({
      success: true,
      sources: { [MILESTONE_ID]: [0, 2] },
    });
  });

  it("accepts appended milestones as null provenance", () => {
    const result = parseMilestoneSources(
      { [MILESTONE_ID]: [0, 1, 2, null] },
      stored,
      { [MILESTONE_ID]: 4 },
    );
    expect(result.success).toBe(true);
  });

  it("accepts an all-new milestone array against an empty stored array", () => {
    const result = parseMilestoneSources(
      { [MILESTONE_ID]: [null, null] },
      {},
      { [MILESTONE_ID]: 2 },
    );
    expect(result.success).toBe(true);
  });

  it("rejects a length that disagrees with the submitted milestones", () => {
    const result = parseMilestoneSources({ [MILESTONE_ID]: [0, 1] }, stored, {
      [MILESTONE_ID]: 3,
    });
    expect(result).toEqual({
      success: false,
      error: "Invalid milestone sources",
    });
  });

  it("rejects two milestones claiming the same stored index", () => {
    const result = parseMilestoneSources({ [MILESTONE_ID]: [1, 1] }, stored, {
      [MILESTONE_ID]: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an index past the end of the stored array", () => {
    const result = parseMilestoneSources({ [MILESTONE_ID]: [0, 3] }, stored, {
      [MILESTONE_ID]: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a type the submitted details do not carry", () => {
    const result = parseMilestoneSources({ __proto__unknown: [0] }, stored, {
      [MILESTONE_ID]: 3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer and negative provenance", () => {
    expect(
      parseMilestoneSources({ [MILESTONE_ID]: [1.5] }, stored, {
        [MILESTONE_ID]: 1,
      }).success,
    ).toBe(false);
    expect(
      parseMilestoneSources({ [MILESTONE_ID]: [-1] }, stored, {
        [MILESTONE_ID]: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-object map", () => {
    expect(parseMilestoneSources([0, 1], stored, stored).success).toBe(false);
  });
});
