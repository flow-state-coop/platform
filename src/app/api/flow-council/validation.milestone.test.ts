/**
 * Unit tests for the "milestone" FormElement type and its validation logic.
 * These tests define the behavioral contract for the feature described in
 * "Configurable Milestone Question Type for Dynamic Form Builder".
 *
 * All tests are expected to FAIL until the feature is implemented.
 */

import { describe, it, expect } from "vitest";
import {
  validateDynamicRoundDetails,
  formElementSchema,
  type FormElement,
} from "./validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MILESTONE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/** A fully-populated milestone element as it would appear in a round formSchema */
function fullMilestoneElement() {
  return {
    id: MILESTONE_UUID,
    type: "milestone" as const,
    label: "Engineering Milestones",
    required: true,
    milestoneLabel: "Build Milestone",
    itemLabel: "Deliverable",
    minCount: 3,
    descriptionPlaceholder: "Describe what you will build.",
    descriptionMinChars: 100,
    descriptionMaxChars: 1000,
  };
}

/** A milestone element with only required fields */
function minimalMilestoneElement() {
  return {
    id: MILESTONE_UUID,
    type: "milestone" as const,
    label: "Milestones",
    required: true,
  };
}

/** A valid milestone data entry */
function validMilestoneEntry({
  title = "Ship the feature",
  description = "x".repeat(100),
  items = ["Deliverable A"],
}: {
  title?: string;
  description?: string;
  items?: string[];
} = {}) {
  return { title, description, items };
}

// ---------------------------------------------------------------------------
// Section 1: formElementSchema — milestone type acceptance
// ---------------------------------------------------------------------------

describe("formElementSchema — milestone type", () => {
  it("accepts a milestone element with all fields populated", () => {
    // The implementation must add "milestone" to the formElementSchema type
    // enum and its milestone-specific fields.
    // formElementSchema.safeParse MUST succeed — this will fail pre-impl because
    // "milestone" is not in the type enum at validation.ts:325.
    const schemaResult = formElementSchema.safeParse(fullMilestoneElement());
    expect(schemaResult.success).toBe(true);

    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [
            validMilestoneEntry(),
            validMilestoneEntry(),
            validMilestoneEntry(),
          ],
        },
      },
      [fullMilestoneElement() as FormElement],
    );
    expect(result.success).toBe(true);
  });

  it("accepts a milestone element with only required fields (id, type, label)", () => {
    // minCount defaults to 1 when not provided
    // formElementSchema.safeParse MUST succeed — will fail pre-impl.
    const schemaResult = formElementSchema.safeParse(minimalMilestoneElement());
    expect(schemaResult.success).toBe(true);

    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry()],
        },
      },
      [minimalMilestoneElement() as FormElement],
    );
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Gap 5: minCount boundary via formElementSchema (converted from validateDynamicRoundDetails)
  // ---------------------------------------------------------------------------

  it("rejects minCount of 0 via formElementSchema (below the 1–5 range)", () => {
    // formElementSchema must reject minCount:0. Pre-impl: formElementSchema rejects
    // ALL milestone elements because "milestone" is not in the type enum.
    // Post-impl: it must specifically reject minCount:0 (out of valid 1–5 range).
    const elementWithZeroMin = { ...fullMilestoneElement(), minCount: 0 };
    const schemaResult = formElementSchema.safeParse(elementWithZeroMin);
    expect(schemaResult.success).toBe(false);
    // The Zod error must reference the range constraint
    const messages = schemaResult.success
      ? []
      : schemaResult.error.issues.map((i) => i.message).join(" ");
    expect(messages).toMatch(/min|range|1|greater/i);
  });

  it("rejects minCount of 6 via formElementSchema (above the 1–5 range)", () => {
    // formElementSchema must reject minCount:6.
    const elementWithSixMin = { ...fullMilestoneElement(), minCount: 6 };
    const schemaResult = formElementSchema.safeParse(elementWithSixMin);
    expect(schemaResult.success).toBe(false);
    const messages = schemaResult.success
      ? []
      : schemaResult.error.issues.map((i) => i.message).join(" ");
    expect(messages).toMatch(/max|range|5|less/i);
  });

  it("accepts minCount of 1 via formElementSchema (lower boundary)", () => {
    const elementWithMinOne = { ...fullMilestoneElement(), minCount: 1 };
    const schemaResult = formElementSchema.safeParse(elementWithMinOne);
    expect(schemaResult.success).toBe(true);
  });

  it("accepts minCount of 5 via formElementSchema (upper boundary)", () => {
    const elementWithMinFive = { ...fullMilestoneElement(), minCount: 5 };
    const schemaResult = formElementSchema.safeParse(elementWithMinFive);
    expect(schemaResult.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 2: validateDynamicRoundDetails — milestone array count validation
// ---------------------------------------------------------------------------

describe("validateDynamicRoundDetails — milestone minCount enforcement", () => {
  it("rejects when the submitted milestone array length is below minCount", () => {
    const element = { ...fullMilestoneElement(), minCount: 3 };
    // Only 2 milestones submitted, minCount is 3
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry(), validMilestoneEntry()],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("accepts when the submitted milestone array length equals minCount", () => {
    const element = { ...fullMilestoneElement(), minCount: 3 };
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [
            validMilestoneEntry(),
            validMilestoneEntry(),
            validMilestoneEntry(),
          ],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(true);
  });

  it("accepts when the submitted milestone array length exceeds minCount", () => {
    const element = { ...fullMilestoneElement(), minCount: 2 };
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [
            validMilestoneEntry(),
            validMilestoneEntry(),
            validMilestoneEntry(),
          ],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 3: per-milestone entry validation — empty fields
// ---------------------------------------------------------------------------

describe("validateDynamicRoundDetails — milestone entry field presence", () => {
  it("rejects a milestone entry with an empty title", () => {
    const element = { ...fullMilestoneElement(), minCount: 1 };
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ title: "" })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("rejects a milestone entry with an empty description", () => {
    const element = {
      ...fullMilestoneElement(),
      minCount: 1,
      descriptionMinChars: 1,
    };
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ description: "" })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("rejects a milestone entry with an empty items array", () => {
    const element = { ...fullMilestoneElement(), minCount: 1 };
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ items: [] })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("rejects a milestone entry where an item string is empty", () => {
    const element = { ...fullMilestoneElement(), minCount: 1 };
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [
            validMilestoneEntry({ items: ["Valid item", ""] }),
          ],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("rejects a milestone entry with more than 50 items", () => {
    const element = { ...fullMilestoneElement(), minCount: 1 };
    const tooMany = Array.from({ length: 51 }, (_, i) => `Item ${i + 1}`);
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ items: tooMany })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/at most 50/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Section 4: descriptionMinChars / descriptionMaxChars
// ---------------------------------------------------------------------------

describe("validateDynamicRoundDetails — milestone description length constraints", () => {
  const DESCRIPTION_MIN = 100;
  const DESCRIPTION_MAX = 1000;

  it("rejects a description shorter than descriptionMinChars", () => {
    const element = {
      ...fullMilestoneElement(),
      minCount: 1,
      descriptionMinChars: DESCRIPTION_MIN,
      descriptionMaxChars: DESCRIPTION_MAX,
    };
    const shortDesc = "x".repeat(DESCRIPTION_MIN - 1);
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ description: shortDesc })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("rejects a description longer than descriptionMaxChars", () => {
    const element = {
      ...fullMilestoneElement(),
      minCount: 1,
      descriptionMinChars: DESCRIPTION_MIN,
      descriptionMaxChars: DESCRIPTION_MAX,
    };
    const longDesc = "x".repeat(DESCRIPTION_MAX + 1);
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ description: longDesc })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(false);
  });

  it("accepts a description exactly at descriptionMinChars", () => {
    const element = {
      ...fullMilestoneElement(),
      minCount: 1,
      descriptionMinChars: DESCRIPTION_MIN,
      descriptionMaxChars: DESCRIPTION_MAX,
    };
    const desc = "x".repeat(DESCRIPTION_MIN);
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ description: desc })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(true);
  });

  it("accepts a description exactly at descriptionMaxChars", () => {
    const element = {
      ...fullMilestoneElement(),
      minCount: 1,
      descriptionMinChars: DESCRIPTION_MIN,
      descriptionMaxChars: DESCRIPTION_MAX,
    };
    const desc = "x".repeat(DESCRIPTION_MAX);
    const result = validateDynamicRoundDetails(
      {
        round: {
          [MILESTONE_UUID]: [validMilestoneEntry({ description: desc })],
        },
      },
      [element as FormElement],
    );
    expect(result.success).toBe(true);
  });
});
