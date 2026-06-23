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

  it("uses largest-remainder rounding so the total is exact", () => {
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1 },
        { recipient: B, weight: 1 },
        { recipient: C, weight: 1 },
      ],
      100n,
      0,
    );
    expect(sum(result)).toBe(100n);
    // 100/3 = 33.33; two get 33, one gets 34.
    const amounts = result.map((v) => Number(v.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([33, 33, 34]);
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

  it("omits recipients that round down to zero", () => {
    // power 2 across 3 equal weights → two recipients get 1, one gets 0 (dropped)
    const result = normalizeWeightsToVotingPower(
      [
        { recipient: A, weight: 1 },
        { recipient: B, weight: 1 },
        { recipient: C, weight: 1 },
      ],
      2n,
      0,
    );
    expect(sum(result)).toBe(2n);
    expect(result.length).toBe(2);
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
