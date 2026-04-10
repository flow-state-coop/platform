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

    expect(large).toBeGreaterThan(small);
  });

  it("is deterministic for identical inputs", () => {
    const params = {
      totalFlowRate: 5n * 10n ** 17n,
      totalUnits: 250n,
      granteeUnits: 25n,
      granteeFlowRate: 5n * 10n ** 16n,
      previousFlowRate: 10n ** 15n,
      newFlowRate: 2n * 10n ** 15n,
      flowRateScaling: 10n ** 13n,
    };

    expect(calcMatchingImpactEstimate(params)).toBe(
      calcMatchingImpactEstimate(params),
    );
  });
});
