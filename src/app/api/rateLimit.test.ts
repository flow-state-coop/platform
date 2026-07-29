import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  allowRequest,
  clientIdentifier,
  resetRateLimits,
  MAX_TRACKED_KEYS,
} from "./rateLimit";

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("allowRequest", () => {
  it("allows up to the limit and refuses the next", () => {
    for (let i = 0; i < 3; i++) {
      expect(allowRequest("ns", "caller", 3, 60_000)).toBe(true);
    }

    expect(allowRequest("ns", "caller", 3, 60_000)).toBe(false);
  });

  it("counts each key separately", () => {
    expect(allowRequest("ns", "a", 1, 60_000)).toBe(true);
    expect(allowRequest("ns", "a", 1, 60_000)).toBe(false);
    expect(allowRequest("ns", "b", 1, 60_000)).toBe(true);
  });

  it("counts the same key separately per namespace", () => {
    expect(allowRequest("one", "caller", 1, 60_000)).toBe(true);
    expect(allowRequest("one", "caller", 1, 60_000)).toBe(false);
    expect(allowRequest("two", "caller", 1, 60_000)).toBe(true);
  });

  it("reopens the window once it expires", () => {
    expect(allowRequest("ns", "caller", 1, 60_000)).toBe(true);
    expect(allowRequest("ns", "caller", 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(allowRequest("ns", "caller", 1, 60_000)).toBe(true);
  });

  // The window is fixed, not sliding: exhausting it does not extend it.
  it("does not push the reset out on a refused request", () => {
    expect(allowRequest("ns", "caller", 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(30_000);
    expect(allowRequest("ns", "caller", 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(30_001);
    expect(allowRequest("ns", "caller", 1, 60_000)).toBe(true);
  });

  // Reopening a window replaces one entry with another, so it must not spend
  // the eviction budget on someone else's still-counted window.
  it("does not evict another key when an expired window reopens", () => {
    expect(allowRequest("ns", "victim", 1, 600_000)).toBe(true);

    for (let i = 0; i < MAX_TRACKED_KEYS - 2; i++) {
      allowRequest("ns", `filler-${i}`, 1, 600_000);
    }

    expect(allowRequest("ns", "refresher", 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(allowRequest("ns", "refresher", 1, 60_000)).toBe(true);

    expect(allowRequest("ns", "victim", 1, 600_000)).toBe(false);
  });

  // Every identifier these limits key on is self-serve, so a flood of one
  // surface must not evict the windows protecting another.
  it("does not evict another namespace's windows when one is flooded", () => {
    expect(allowRequest("protected", "victim", 1, 600_000)).toBe(true);

    for (let i = 0; i < MAX_TRACKED_KEYS * 2; i++) {
      allowRequest("flooded", `filler-${i}`, 1, 600_000);
    }

    expect(allowRequest("protected", "victim", 1, 600_000)).toBe(false);
  });
});

describe("clientIdentifier", () => {
  it("prefers the header the platform sets over a caller-supplied one", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-forwarded-for": "5.6.7.8",
      "x-real-ip": "9.10.11.12",
    });

    expect(clientIdentifier(headers)).toBe("5.6.7.8");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIdentifier(new Headers({ "x-real-ip": "9.10.11.12" }))).toBe(
      "9.10.11.12",
    );
  });

  it("reads the plain object NextAuth hands its provider", () => {
    expect(clientIdentifier({ "x-real-ip": "9.10.11.12" })).toBe("9.10.11.12");
  });

  it("shares one window rather than handing out a fresh one per request", () => {
    expect(clientIdentifier(new Headers())).toBe("unknown");
    expect(clientIdentifier(undefined)).toBe("unknown");
  });
});
