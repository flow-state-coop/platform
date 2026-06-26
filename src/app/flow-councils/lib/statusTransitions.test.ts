import { describe, it, expect } from "vitest";
import { getAllowedStatusTransitions } from "./statusTransitions";

describe("getAllowedStatusTransitions", () => {
  it("lets an accepted grantee move back to review, removed, or graduated", () => {
    expect(getAllowedStatusTransitions("ACCEPTED")).toEqual([
      "SUBMITTED",
      "REMOVED",
      "GRADUATED",
    ]);
  });

  it("lets removed and graduated grantees be re-accepted", () => {
    expect(getAllowedStatusTransitions("REMOVED")).toEqual(["ACCEPTED"]);
    expect(getAllowedStatusTransitions("GRADUATED")).toEqual([
      "ACCEPTED",
      "REMOVED",
    ]);
  });

  it("offers accept/changes/reject for not-yet-accepted statuses, excluding the current one", () => {
    expect(getAllowedStatusTransitions("INCOMPLETE")).toEqual([
      "ACCEPTED",
      "CHANGES_REQUESTED",
      "REJECTED",
    ]);
    expect(getAllowedStatusTransitions("SUBMITTED")).toEqual([
      "ACCEPTED",
      "CHANGES_REQUESTED",
      "REJECTED",
    ]);
    expect(getAllowedStatusTransitions("CHANGES_REQUESTED")).toEqual([
      "ACCEPTED",
      "REJECTED",
    ]);
    expect(getAllowedStatusTransitions("REJECTED")).toEqual([
      "ACCEPTED",
      "CHANGES_REQUESTED",
    ]);
  });

  it("never allows a no-op transition to the same status", () => {
    for (const status of [
      "INCOMPLETE",
      "SUBMITTED",
      "ACCEPTED",
      "CHANGES_REQUESTED",
      "REJECTED",
      "REMOVED",
      "GRADUATED",
    ] as const) {
      expect(getAllowedStatusTransitions(status)).not.toContain(status);
    }
  });
});
