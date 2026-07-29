import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { allowRequest, resetRateLimits, MAX_TRACKED_KEYS } from "./rateLimit";

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
      expect(allowRequest("caller", 3, 60_000)).toBe(true);
    }

    expect(allowRequest("caller", 3, 60_000)).toBe(false);
  });

  it("counts each key separately", () => {
    expect(allowRequest("a", 1, 60_000)).toBe(true);
    expect(allowRequest("a", 1, 60_000)).toBe(false);
    expect(allowRequest("b", 1, 60_000)).toBe(true);
  });

  it("reopens the window once it expires", () => {
    expect(allowRequest("caller", 1, 60_000)).toBe(true);
    expect(allowRequest("caller", 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(allowRequest("caller", 1, 60_000)).toBe(true);
  });

  // The window is fixed, not sliding: exhausting it does not extend it.
  it("does not push the reset out on a refused request", () => {
    expect(allowRequest("caller", 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(30_000);
    expect(allowRequest("caller", 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(30_001);
    expect(allowRequest("caller", 1, 60_000)).toBe(true);
  });

  // Reopening a window replaces one entry with another, so it must not spend
  // the eviction budget on someone else's still-counted window.
  it("does not evict another key when an expired window reopens", () => {
    expect(allowRequest("victim", 1, 600_000)).toBe(true);

    for (let i = 0; i < MAX_TRACKED_KEYS - 2; i++) {
      allowRequest(`filler-${i}`, 1, 600_000);
    }

    expect(allowRequest("refresher", 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(allowRequest("refresher", 1, 60_000)).toBe(true);

    expect(allowRequest("victim", 1, 600_000)).toBe(false);
  });
});
