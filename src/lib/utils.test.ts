import { describe, expect, it } from "vitest";
import {
  formatNumberWithCommas,
  isNumber,
  sqrtBigInt,
  truncateStr,
} from "./utils";

describe("isNumber", () => {
  it("returns true for numeric strings", () => {
    expect(isNumber("42")).toBe(true);
    expect(isNumber("3.14")).toBe(true);
    expect(isNumber("-1.5")).toBe(true);
    expect(isNumber("0")).toBe(true);
  });

  it("returns false for non-numeric strings", () => {
    expect(isNumber("abc")).toBe(false);
    expect(isNumber("")).toBe(false);
    expect(isNumber("12abc")).toBe(false);
  });
});

describe("sqrtBigInt", () => {
  it("returns 0 and 1 unchanged", () => {
    expect(sqrtBigInt(0n)).toBe(0n);
    expect(sqrtBigInt(1n)).toBe(1n);
  });

  it("computes the integer square root", () => {
    expect(sqrtBigInt(4n)).toBe(2n);
    expect(sqrtBigInt(16n)).toBe(4n);
    expect(sqrtBigInt(10000n)).toBe(100n);
  });

  it("floors non-perfect squares", () => {
    expect(sqrtBigInt(10n)).toBe(3n);
    expect(sqrtBigInt(99n)).toBe(9n);
  });

  it("handles values larger than Number.MAX_SAFE_INTEGER", () => {
    const big = 10n ** 30n;
    const root = sqrtBigInt(big);
    expect(root * root <= big).toBe(true);
    expect((root + 1n) * (root + 1n) > big).toBe(true);
  });
});

describe("formatNumberWithCommas", () => {
  it("inserts thousands separators in whole numbers", () => {
    expect(formatNumberWithCommas("100")).toBe("100");
    expect(formatNumberWithCommas("1000")).toBe("1,000");
    expect(formatNumberWithCommas("1234567")).toBe("1,234,567");
  });

  it("preserves decimal portions", () => {
    expect(formatNumberWithCommas("1234.56")).toBe("1,234.56");
    expect(formatNumberWithCommas("1000000.5")).toBe("1,000,000.5");
  });
});

describe("truncateStr", () => {
  it("returns the string unchanged when shorter than the limit", () => {
    expect(truncateStr("hello", 10)).toBe("hello");
    expect(truncateStr("exact", 5)).toBe("exact");
  });

  it("truncates with an ellipsis in the middle", () => {
    // length 18 → frontChars=4, backChars=3 (charsToShow=7)
    expect(truncateStr("0x1234567890abcdef", 10)).toBe("0x12...def");
  });
});
