import { describe, it, expect } from "vitest";
import {
  computeCastVotes,
  computeNewVotingPower,
  wouldReduceBelowCast,
  pctCast,
  passesPctFilter,
  shareOfVotes,
  totalPages,
} from "./voterUtils";

// Spec: "Voter table … Votes cast (raw and as a fraction of allocation)"
// Spec: "Apply to filtered — assign or increment votes for whatever subset is currently filtered/visible.
//        The UI must always make clear which mode (set vs. increment) is active."
// Spec: "Composable filters … By % of allocation already cast (e.g., > 80%)"
// Spec: "The Voters tab clearly shows, for each group … votes used (raw and as % of assigned)
//        and the group's share of total outstanding votes."
// Spec success criterion: "Mid-round warnings: Reducing a voter's allocation below the number of
//        votes they've already cast."

// ---------------------------------------------------------------------------
// computeCastVotes
// ---------------------------------------------------------------------------

describe("computeCastVotes", () => {
  it("returns 0 when ballot is absent", () => {
    expect(computeCastVotes({})).toBe(0);
  });

  it("returns 0 when ballot.votes is undefined", () => {
    expect(computeCastVotes({ ballot: {} })).toBe(0);
  });

  it("returns 0 when ballot.votes is an empty array", () => {
    expect(computeCastVotes({ ballot: { votes: [] } })).toBe(0);
  });

  it("returns the amount for a single vote", () => {
    expect(computeCastVotes({ ballot: { votes: [{ amount: "7" }] } })).toBe(7);
  });

  it("sums amounts across multiple votes", () => {
    expect(
      computeCastVotes({
        ballot: {
          votes: [{ amount: "3" }, { amount: "4" }, { amount: "1" }],
        },
      }),
    ).toBe(8);
  });

  it("handles string amounts that parse to decimals by summing their numeric values", () => {
    // The subgraph returns amounts as strings; the function must parse them
    expect(
      computeCastVotes({
        ballot: { votes: [{ amount: "10" }, { amount: "20" }] },
      }),
    ).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// computeNewVotingPower
// ---------------------------------------------------------------------------

describe("computeNewVotingPower", () => {
  describe('mode "set"', () => {
    it("returns value regardless of existingPower", () => {
      expect(computeNewVotingPower(5, 10, "set")).toBe(10);
    });

    it("returns 0 when value is 0 (set mode)", () => {
      expect(computeNewVotingPower(100, 0, "set")).toBe(0);
    });

    it("replaces a non-zero existing power with a new value", () => {
      expect(computeNewVotingPower(50, 25, "set")).toBe(25);
    });
  });

  describe('mode "increment"', () => {
    it("adds value to existingPower", () => {
      expect(computeNewVotingPower(5, 3, "increment")).toBe(8);
    });

    it("returns existingPower when value is 0 (increment mode)", () => {
      expect(computeNewVotingPower(10, 0, "increment")).toBe(10);
    });

    it("handles zero existingPower with positive increment", () => {
      expect(computeNewVotingPower(0, 7, "increment")).toBe(7);
    });
  });
});

// ---------------------------------------------------------------------------
// wouldReduceBelowCast
// ---------------------------------------------------------------------------

describe("wouldReduceBelowCast", () => {
  it("returns false when newPower equals castVotes", () => {
    expect(wouldReduceBelowCast(5, 5)).toBe(false);
  });

  it("returns false when newPower is greater than castVotes", () => {
    expect(wouldReduceBelowCast(10, 5)).toBe(false);
  });

  it("returns true when newPower is strictly less than castVotes", () => {
    expect(wouldReduceBelowCast(4, 5)).toBe(true);
  });

  it("returns false when castVotes is 0 and newPower is 0", () => {
    expect(wouldReduceBelowCast(0, 0)).toBe(false);
  });

  it("returns true when newPower is 0 and castVotes is positive", () => {
    expect(wouldReduceBelowCast(0, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pctCast
// ---------------------------------------------------------------------------

describe("pctCast", () => {
  it("returns 0 when allocation is 0 (avoid divide-by-zero)", () => {
    expect(pctCast(5, 0)).toBe(0);
  });

  it("returns 0 when castVotes is 0", () => {
    expect(pctCast(0, 100)).toBe(0);
  });

  it("returns 100 when all votes are cast", () => {
    expect(pctCast(10, 10)).toBe(100);
  });

  it("returns 50 when half the votes are cast", () => {
    expect(pctCast(5, 10)).toBe(50);
  });

  it("returns 80 for 8 cast out of 10 allocation", () => {
    expect(pctCast(8, 10)).toBe(80);
  });

  it("can return values > 100 if cast exceeds allocation (spec does not cap it)", () => {
    // Implementation may or may not cap — we assert the math is correct
    expect(pctCast(12, 10)).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// passesPctFilter
// ---------------------------------------------------------------------------

// Spec: "By % of allocation already cast (e.g., > 80%)" — strictly greater-than

describe("passesPctFilter", () => {
  it("returns false when pctCast equals threshold 0 (strict > not >=)", () => {
    // "> 0" threshold: a voter with 0 cast does NOT pass
    expect(passesPctFilter(0, 10, 0)).toBe(false);
  });

  it("returns true when pct cast is strictly greater than threshold 0", () => {
    expect(passesPctFilter(1, 10, 0)).toBe(true);
  });

  it("returns false when pct cast equals threshold 25", () => {
    expect(passesPctFilter(25, 100, 25)).toBe(false);
  });

  it("returns true when pct cast is strictly greater than threshold 25", () => {
    expect(passesPctFilter(26, 100, 25)).toBe(true);
  });

  it("returns false when pct cast equals threshold 50", () => {
    expect(passesPctFilter(5, 10, 50)).toBe(false);
  });

  it("returns true when pct cast is strictly greater than threshold 50", () => {
    expect(passesPctFilter(6, 10, 50)).toBe(true);
  });

  it("returns false when pct cast equals threshold 80", () => {
    expect(passesPctFilter(8, 10, 80)).toBe(false);
  });

  it("returns true when pct cast is strictly greater than threshold 80", () => {
    expect(passesPctFilter(9, 10, 80)).toBe(true);
  });

  it("returns false when pct cast equals 100 and threshold is 100", () => {
    expect(passesPctFilter(10, 10, 100)).toBe(false);
  });

  it("returns 0 for allocation=0 without divide-by-zero and therefore fails any positive threshold", () => {
    // pctCast(5, 0) = 0; 0 > 50 is false
    expect(passesPctFilter(5, 0, 50)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shareOfVotes
// ---------------------------------------------------------------------------

// Spec: "Group's share of total outstanding votes" column on the overview table

describe("shareOfVotes", () => {
  it("returns 0 when totalCouncilVotes is 0 (avoid divide-by-zero)", () => {
    expect(shareOfVotes(10, 0)).toBe(0);
  });

  it("returns 0 when groupAssignedVotes is 0", () => {
    expect(shareOfVotes(0, 100)).toBe(0);
  });

  it("returns 100 when group holds all council votes", () => {
    expect(shareOfVotes(100, 100)).toBe(100);
  });

  it("returns 50 when group holds half the council votes", () => {
    expect(shareOfVotes(50, 100)).toBe(50);
  });

  it("returns correct percentage for partial share", () => {
    expect(shareOfVotes(30, 120)).toBeCloseTo(25, 5);
  });
});

// ---------------------------------------------------------------------------
// totalPages
// ---------------------------------------------------------------------------

// Spec: voter table is paginated; impl-plan page size is 50

describe("totalPages", () => {
  it("returns 1 for 0 filtered items (at least one page always)", () => {
    expect(totalPages(0, 50)).toBe(1);
  });

  it("returns 1 for exactly one page of items", () => {
    expect(totalPages(50, 50)).toBe(1);
  });

  it("returns 2 when there is one item on the second page", () => {
    expect(totalPages(51, 50)).toBe(2);
  });

  it("returns 3 for 123 items with page size 50 (Math.ceil(123/50) = 3)", () => {
    expect(totalPages(123, 50)).toBe(3);
  });

  it("returns 1 for a count smaller than page size", () => {
    expect(totalPages(7, 50)).toBe(1);
  });

  it("returns correct count for an exact multiple", () => {
    expect(totalPages(100, 50)).toBe(2);
  });
});
