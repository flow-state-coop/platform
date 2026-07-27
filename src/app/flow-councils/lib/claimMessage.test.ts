import { describe, it, expect } from "vitest";
import { buildClaimMessage } from "./claimMessage";

// Spec (Voter: the eligibility popup, step 7): "The signed message is plain text in the
//   standard structured form, naming what it authorizes and binding it to this council,
//   chain, wallet, and moment … It is not a sign-in and creates no session."
// Impl-plan task 10 fixes the exact text. Addresses render IN FULL where the spec's
// illustrative example truncated them (0x1234…abcd): a signed message must be verifiable
// from its own text, and a truncated address is not. Recorded deliberate deviation.
// Client and server build the message from the same function, so any input the two sides
// spell differently (address casing, sub-second precision) must produce the same text or
// every signature fails verification.

const COUNCIL = "0x1234567890abcdef1234567890abcdef12345678";
const WALLET = "0x5678901234abcdef5678901234abcdef56789012";
const CHAIN_ID = 8453;
const ISSUED_AT = Date.UTC(2026, 6, 21, 14, 32, 0);

const EXPECTED = [
  "Claim voting rights in this Flow Council.",
  "",
  `Council: ${COUNCIL}`,
  `Chain: ${CHAIN_ID}`,
  `Wallet: ${WALLET}`,
  "Issued at: 2026-07-21T14:32:00Z",
].join("\n");

const build = (
  overrides: Partial<{
    chainId: number;
    councilId: string;
    address: string;
    issuedAt: number;
  }> = {},
) =>
  buildClaimMessage({
    chainId: CHAIN_ID,
    councilId: COUNCIL,
    address: WALLET,
    issuedAt: ISSUED_AT,
    ...overrides,
  });

describe("buildClaimMessage", () => {
  describe("exact wording", () => {
    it("renders the fixed plain-text claim message", () => {
      expect(build()).toBe(EXPECTED);
    });

    it("names what it authorizes on the first line", () => {
      expect(build().split("\n")[0]).toBe(
        "Claim voting rights in this Flow Council.",
      );
    });

    it("renders both addresses in full rather than truncated", () => {
      const message = build();

      expect(message).toContain(`Council: ${COUNCIL}`);
      expect(message).toContain(`Wallet: ${WALLET}`);
      expect(message).not.toContain("…");
      expect(message).not.toContain("...");
    });
  });

  describe("timestamp", () => {
    it("renders the issue time as ISO-8601 UTC with second precision", () => {
      expect(build()).toContain("Issued at: 2026-07-21T14:32:00Z");
    });

    it("drops sub-second precision so the same moment always renders the same text", () => {
      expect(build({ issuedAt: ISSUED_AT + 999 })).toBe(EXPECTED);
    });

    it("renders a different moment differently, binding the message to when it was issued", () => {
      expect(build({ issuedAt: ISSUED_AT + 60_000 })).toContain(
        "Issued at: 2026-07-21T14:33:00Z",
      );
    });
  });

  describe("determinism", () => {
    it("returns an identical message for identical inputs", () => {
      expect(build()).toBe(build());
    });

    it("returns the same message whether the wallet address arrives checksummed or lowercase", () => {
      const checksummed = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

      expect(build({ address: checksummed })).toBe(
        build({ address: checksummed.toLowerCase() }),
      );
    });

    it("returns the same message whether the council address arrives checksummed or lowercase", () => {
      const checksummed = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

      expect(build({ councilId: checksummed })).toBe(
        build({ councilId: checksummed.toLowerCase() }),
      );
    });
  });

  describe("binding", () => {
    it("binds the message to the council", () => {
      expect(build({ councilId: WALLET })).not.toBe(EXPECTED);
    });

    it("binds the message to the chain", () => {
      const message = build({ chainId: 42220 });

      expect(message).toContain("Chain: 42220");
      expect(message).not.toBe(EXPECTED);
    });

    it("binds the message to the wallet", () => {
      expect(build({ address: COUNCIL })).not.toBe(EXPECTED);
    });
  });
});
