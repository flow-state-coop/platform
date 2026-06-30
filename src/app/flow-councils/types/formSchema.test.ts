import { describe, it, expect } from "vitest";
import { GOODBUILDERS_TEMPLATE } from "./formSchema";

describe("GOODBUILDERS_TEMPLATE", () => {
  // Guards against the milestone questions silently regressing to plain
  // textareas (the Season 4 bug): a round created from this preset must capture
  // structured, trackable milestones, not free text.
  it("uses the milestone field type for Build and Growth Milestones", () => {
    const build = GOODBUILDERS_TEMPLATE.round.find((e) => e.id === "gb-r-q14");
    const growth = GOODBUILDERS_TEMPLATE.round.find((e) => e.id === "gb-r-q18");

    expect(build).toMatchObject({
      type: "milestone",
      itemLabel: "Deliverable",
      required: true,
    });
    expect(growth).toMatchObject({
      type: "milestone",
      itemLabel: "Activation",
      required: true,
    });
  });
});
