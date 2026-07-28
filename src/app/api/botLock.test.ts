import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/api/db", () => ({ db: {} }));

import { resolveNonce } from "./botLock";

const NOW = new Date("2026-07-28T12:00:00Z").getTime();
const fresh = new Date(NOW - 10_000);
const stale = new Date(NOW - 10 * 60_000);

describe("resolveNonce", () => {
  it("trusts the RPC when nothing has been broadcast yet", () => {
    expect(resolveNonce(7, null, null, NOW)).toBe(7);
  });

  it("advances past a pending count that has not caught up to our last send", () => {
    // The load-balanced RPC answered from a node that never saw nonce 4, which
    // is the duplicate-nonce case the ledger exists to prevent.
    expect(resolveNonce(4, "4", fresh, NOW)).toBe(5);
  });

  it("prefers the RPC when it is ahead of the ledger", () => {
    // Someone sent from this key outside the platform; the chain wins.
    expect(resolveNonce(9, "4", fresh, NOW)).toBe(9);
  });

  it("falls back to the RPC once the ledger is too old to trust", () => {
    // Past the staleness window the recorded send is assumed dropped rather
    // than merely unpropagated, so holding the nonce above it would gap the key
    // permanently.
    expect(resolveNonce(4, "4", stale, NOW)).toBe(4);
  });

  it("treats a missing ledger column as absent rather than as a value", () => {
    expect(
      resolveNonce(
        3,
        undefined as unknown as string | null,
        undefined as unknown as Date | null,
        NOW,
      ),
    ).toBe(3);
  });
});
