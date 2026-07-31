import { describe, it, expect } from "vitest";
import { getApiEligibility } from "./splitterEligibility";

describe("getApiEligibility", () => {
  it("allows a pool with admins and non-transferable shares", () => {
    expect(
      getApiEligibility({ hasAdmins: true, transferableUnits: false }),
    ).toEqual({ status: "available" });
  });

  it("refuses a pool with no admins", () => {
    expect(
      getApiEligibility({ hasAdmins: false, transferableUnits: false }),
    ).toEqual({ status: "unavailable", reason: "immutable" });
  });

  it("refuses a pool with transferable shares", () => {
    expect(
      getApiEligibility({ hasAdmins: true, transferableUnits: true }),
    ).toEqual({ status: "unavailable", reason: "transferable" });
  });

  it("reports the immutable reason first when both apply", () => {
    expect(
      getApiEligibility({ hasAdmins: false, transferableUnits: true }),
    ).toEqual({ status: "unavailable", reason: "immutable" });
  });

  // An unresolved or failed transferability read must not read as "eligible":
  // granting the bot admin on a transferable pool is irreversible and useless.
  it("withholds a verdict while transferability is unknown", () => {
    expect(
      getApiEligibility({ hasAdmins: true, transferableUnits: undefined }),
    ).toEqual({ status: "unknown" });
  });

  it("still refuses a pool with no admins when transferability is unknown", () => {
    expect(
      getApiEligibility({ hasAdmins: false, transferableUnits: undefined }),
    ).toEqual({ status: "unavailable", reason: "immutable" });
  });

  // An unread admin list is not an empty one: reporting a mutable pool as
  // permanently immutable is the worst thing this can say.
  it("withholds a verdict while the admin list is unknown", () => {
    expect(
      getApiEligibility({ hasAdmins: undefined, transferableUnits: false }),
    ).toEqual({ status: "unknown" });

    expect(
      getApiEligibility({ hasAdmins: undefined, transferableUnits: undefined }),
    ).toEqual({ status: "unknown" });
  });
});
