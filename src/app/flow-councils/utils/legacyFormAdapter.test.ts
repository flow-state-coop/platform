import { describe, it, expect } from "vitest";
import type { RoundForm } from "@/app/flow-councils/types/round";
import { adaptLegacyRoundData } from "./legacyFormAdapter";

describe("adaptLegacyRoundData", () => {
  // The GoodBuilders template's milestone questions are milestone-type, so a
  // legacy (Season 3) application rendered through the dynamic view must map its
  // structured build/growth milestones into the {title, description, items}
  // array shape — not a flattened markdown string.
  it("maps legacy build/growth milestones into the milestone-array shape", () => {
    const data: Partial<RoundForm> = {
      buildGoals: {
        primaryBuildGoal: "Ship it",
        ecosystemImpact: "",
        milestones: [
          {
            title: "M1",
            description: "Build the thing",
            deliverables: ["a", "b", "   "],
          },
        ],
      },
      growthGoals: {
        primaryGrowthGoal: "Grow it",
        targetUsers: "",
        ecosystemImpact: "",
        milestones: [
          {
            title: "G1",
            description: "Grow the thing",
            activations: ["x", ""],
          },
        ],
      },
    };

    const result = adaptLegacyRoundData(data);

    expect(result["gb-r-q14"]).toEqual([
      { title: "M1", description: "Build the thing", items: ["a", "b"] },
    ]);
    expect(result["gb-r-q18"]).toEqual([
      { title: "G1", description: "Grow the thing", items: ["x"] },
    ]);
  });

  it("omits the milestone fields when there are no milestones", () => {
    const result = adaptLegacyRoundData({});
    expect(result["gb-r-q14"]).toBeUndefined();
    expect(result["gb-r-q18"]).toBeUndefined();
  });
});
