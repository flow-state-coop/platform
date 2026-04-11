import { describe, expect, it } from "vitest";
import { calcMatchingImpactEstimate } from "./matchingImpactEstimate";

describe("calcMatchingImpactEstimate", () => {
  it("scales the delta upward when the new contribution grows", () => {
    const base = {
      totalFlowRate: 10n ** 18n,
      totalUnits: 100n,
      granteeUnits: 10n,
      granteeFlowRate: 10n ** 17n,
      previousFlowRate: 0n,
      flowRateScaling: 10n ** 13n,
    };

    const small = calcMatchingImpactEstimate({
      ...base,
      newFlowRate: 10n ** 18n,
    });
    const large = calcMatchingImpactEstimate({
      ...base,
      newFlowRate: 10n ** 20n,
    });

    // Pinned values guard against accidental formula changes; ordering
    // alone would only catch monotonicity regressions.
    expect(small).toBe(58878504672897196n);
    expect(large).toBe(557794676806083650n);
    expect(large).toBeGreaterThan(small);
  });

  it("matches a pinned value for a representative input set", () => {
    const result = calcMatchingImpactEstimate({
      totalFlowRate: 5n * 10n ** 17n,
      totalUnits: 250n,
      granteeUnits: 25n,
      granteeFlowRate: 5n * 10n ** 16n,
      previousFlowRate: 10n ** 15n,
      newFlowRate: 10n ** 17n,
      flowRateScaling: 10n ** 13n,
    });

    expect(result).toBe(3571428571428571n);
  });
});
