import { describe, it, expect, beforeAll } from "vitest";
import {
  generateNotificationToken,
  verifyNotificationToken,
} from "./notificationToken";

beforeAll(() => {
  process.env.NOTIFICATION_HMAC_SECRET = "test-secret-for-unit-tests-only";
});

describe("notificationToken", () => {
  const addr = "0x1234567890abcdef1234567890ABCDEF12345678";

  it("verifies a token signed with the same address and version", () => {
    const token = generateNotificationToken(addr, 3);
    expect(verifyNotificationToken(addr, 3, token)).toBe(true);
  });

  it("rejects a token signed against a different email version", () => {
    const token = generateNotificationToken(addr, 3);
    expect(verifyNotificationToken(addr, 4, token)).toBe(false);
  });

  it("rejects a token signed by a different address", () => {
    const token = generateNotificationToken(addr, 3);
    const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefABCD";
    expect(verifyNotificationToken(other, 3, token)).toBe(false);
  });

  it("treats addresses case-insensitively (canonical lowercase)", () => {
    const lower = generateNotificationToken(addr.toLowerCase(), 1);
    const upper = generateNotificationToken(addr.toUpperCase(), 1);
    expect(lower).toBe(upper);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifyNotificationToken(addr, 0, "")).toBe(false);
    expect(verifyNotificationToken(addr, 0, "garbage")).toBe(false);
  });
});
