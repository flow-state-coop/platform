import { describe, it, expect } from "vitest";
import {
  normalizeWeightsToVotingPower,
  votesEqual,
  type BallotVote,
} from "./normalize";

const A = "0x000000000000000000000000000000000000000a";
const B = "0x000000000000000000000000000000000000000b";
const C = "0x000000000000000000000000000000000000000c";
const D = "0x000000000000000000000000000000000000000d";

function sum(votes: BallotVote[]): bigint {
  return votes.reduce((acc, v) => acc + v.amount, 0n);
}

describe("normalizeWeightsToVotingPower", () => {
  it("splits proportionally and sums to the voting power", () => {
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 3 },
        { recipient: B, weight: 1 },
      ],
      100n,
      0,
    );
    expect(sum(result)).toBe(100n);
    const byAddr = new Map(result.map((v) => [v.recipient, v.amount]));
    expect(byAddr.get(A)).toBe(75n);
    expect(byAddr.get(B)).toBe(25n);
  });

  it("drops the leftover on an even split rather than favoring one recipient", () => {
    // 100/3 = 33.33; all three are tied for the single leftover unit, so it is
    // dropped (33 each) instead of arbitrarily giving one recipient 34.
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1 },
        { recipient: B, weight: 1 },
        { recipient: C, weight: 1 },
      ],
      100n,
      0,
    );
    const amounts = result.map((v) => Number(v.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([33, 33, 33]);
    expect(sum(result)).toBe(99n);
  });

  it("rounds an even 4-way split down instead of bumping the first recipient", () => {
    // 101/4 = 25.25 each. Largest-remainder would hand the leftover unit to the
    // lowest-address recipient (26/25/25/25); the tie is ambiguous so it is
    // dropped, leaving an even 25/25/25/25.
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 25 },
        { recipient: B, weight: 25 },
        { recipient: C, weight: 25 },
        { recipient: D, weight: 25 },
      ],
      101n,
      0,
    );
    expect(result.map((v) => Number(v.amount))).toEqual([25, 25, 25, 25]);
    expect(sum(result)).toBe(100n);
  });

  it("still awards a strictly-larger remainder its rounding unit", () => {
    // 2:1 of 100 → 66.67 / 33.33. A's remainder strictly exceeds B's, so A wins
    // the leftover unit (the rounding is unambiguous): 67/33, full power used.
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 2 },
        { recipient: B, weight: 1 },
      ],
      100n,
      0,
    );
    expect(sum(result)).toBe(100n);
    const byAddr = new Map(result.map((v) => [v.recipient, v.amount]));
    expect(byAddr.get(A)).toBe(67n);
    expect(byAddr.get(B)).toBe(33n);
  });

  it("caps to maxVotingSpread by top weight and still sums to power", () => {
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 10 },
        { recipient: B, weight: 5 },
        { recipient: C, weight: 3 },
        { recipient: D, weight: 1 },
      ],
      100n,
      2,
    );
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.recipient).sort()).toEqual([A, B]);
    expect(sum(result)).toBe(100n);
  });

  it("drops zero/negative weights", () => {
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1 },
        { recipient: B, weight: 0 },
        { recipient: C, weight: -5 },
      ],
      50n,
      0,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ recipient: A, amount: 50n });
  });

  it("omits recipients whose share rounds down to zero", () => {
    // power 10 across weights 100:1:1 → 9.8 / 0.098 / 0.098. Only the heaviest
    // clears a whole vote; the two tiny shares round down and are dropped.
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 100 },
        { recipient: B, weight: 1 },
        { recipient: C, weight: 1 },
      ],
      10n,
      0,
    );
    expect(result).toEqual([{ recipient: A, amount: 10n }]);
  });

  it("drops the whole ballot when every share rounds down to zero", () => {
    // power 2 across 3 equal weights → 0.67 each, all tied, all dropped.
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1 },
        { recipient: B, weight: 1 },
        { recipient: C, weight: 1 },
      ],
      2n,
      0,
    );
    expect(result).toEqual([]);
  });

  it("returns empty for all-zero weights or zero power", () => {
    expect(
      normalizeWeightsToVotingPower([{ recipient: A, weight: 0 }], 100n, 0),
    ).toEqual([]);
    expect(
      normalizeWeightsToVotingPower([{ recipient: A, weight: 1 }], 0n, 0),
    ).toEqual([]);
  });

  it("apportions exactly at uint96-scale power (above MAX_SAFE_INTEGER)", () => {
    const power = (1n << 96n) - 1n;
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 3 },
        { recipient: B, weight: 1 },
      ],
      power,
      0,
    );
    expect(sum(result)).toBe(power);
    expect(result.every((v) => v.amount > 0n && v.amount <= power)).toBe(true);
    const byAddr = new Map(result.map((v) => [v.recipient, v.amount]));
    expect(byAddr.get(A)! > byAddr.get(B)! * 2n).toBe(true);
    expect(byAddr.get(A)! < byAddr.get(B)! * 4n).toBe(true);
  });

  it("handles very large finite weights without overflowing to empty", () => {
    // Summing these would be Infinity; scaling relative to the max keeps the
    // ballot valid and proportional.
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1e308 },
        { recipient: B, weight: 1e308 },
      ],
      100n,
      0,
    );
    expect(sum(result)).toBe(100n);
    const byAddr = new Map(result.map((v) => [v.recipient, v.amount]));
    expect(byAddr.get(A)).toBe(50n);
    expect(byAddr.get(B)).toBe(50n);
  });

  it("preserves proportions across a huge weight spread", () => {
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1e300 },
        { recipient: B, weight: 3e300 },
      ],
      100n,
      0,
    );
    expect(sum(result)).toBe(100n);
    const byAddr = new Map(result.map((v) => [v.recipient, v.amount]));
    expect(byAddr.get(A)).toBe(25n);
    expect(byAddr.get(B)).toBe(75n);
  });

  it("is deterministic regardless of input order", () => {
    const a = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 3 },
        { recipient: B, weight: 1 },
      ],
      100n,
      0,
    );
    const b = normalizeWeightsToVotingPower(
      [
        { recipient: B, weight: 1 },
        { recipient: A, weight: 3 },
      ],
      100n,
      0,
    );
    expect(a).toEqual(b);
  });
});

describe("votesEqual", () => {
  it("is true for the same ballot in any order", () => {
    expect(
      votesEqual(
        [
          { recipient: A, amount: 75n },
          { recipient: B, amount: 25n },
        ],
        [
          { recipient: B, amount: 25n },
          { recipient: A, amount: 75n },
        ],
      ),
    ).toBe(true);
  });

  it("is false when amounts or membership differ", () => {
    expect(
      votesEqual(
        [{ recipient: A, amount: 75n }],
        [{ recipient: A, amount: 74n }],
      ),
    ).toBe(false);
    expect(
      votesEqual(
        [{ recipient: A, amount: 50n }],
        [
          { recipient: A, amount: 50n },
          { recipient: B, amount: 50n },
        ],
      ),
    ).toBe(false);
  });
});
