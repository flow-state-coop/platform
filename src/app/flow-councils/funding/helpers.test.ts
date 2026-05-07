import { describe, expect, it } from "vitest";
import { isPositiveDecimal, sanitizeTxError } from "./helpers";

describe("isPositiveDecimal", () => {
  it.each([
    ["0", true],
    ["1", true],
    ["1.5", true],
    ["1.", true],
    [".5", true],
    ["123.456", true],
  ])("accepts %j", (input, expected) => {
    expect(isPositiveDecimal(input)).toBe(expected);
  });

  it.each([
    ["", false],
    [".", false],
    ["-1", false],
    ["1.2.3", false],
    ["1e3", false],
    ["abc", false],
    ["1 ", false],
  ])("rejects %j", (input, expected) => {
    expect(isPositiveDecimal(input)).toBe(expected);
  });
});

describe("sanitizeTxError", () => {
  it("returns generic message for non-object input", () => {
    expect(sanitizeTxError("oops")).toBe("Transaction failed");
    expect(sanitizeTxError(undefined)).toBe("Transaction failed");
    expect(sanitizeTxError(null)).toBe("Transaction failed");
  });

  it("maps ACTION_REJECTED code to a rejection message", () => {
    expect(sanitizeTxError({ code: "ACTION_REJECTED" })).toBe(
      "Transaction rejected",
    );
  });

  it("maps EIP-1193 4001 code to a rejection message", () => {
    expect(sanitizeTxError({ code: 4001 })).toBe("Transaction rejected");
  });

  it("maps UserRejectedRequestError name to a rejection message", () => {
    expect(sanitizeTxError({ name: "UserRejectedRequestError" })).toBe(
      "Transaction rejected",
    );
  });

  it("maps a 'user rejected' message (case-insensitive)", () => {
    expect(
      sanitizeTxError({ message: "MetaMask Tx Signature: User Rejected" }),
    ).toBe("Transaction rejected");
  });

  it("maps an AccessControl revert to a role-missing message", () => {
    expect(
      sanitizeTxError({
        message:
          "execution reverted: AccessControl: account 0x... is missing role 0x...",
      }),
    ).toBe("Not authorized: missing role on the splitter contract");
  });

  it("falls back to generic message for unknown errors", () => {
    expect(sanitizeTxError({ message: "ECONNRESET" })).toBe(
      "Transaction failed",
    );
    expect(sanitizeTxError({})).toBe("Transaction failed");
  });
});
