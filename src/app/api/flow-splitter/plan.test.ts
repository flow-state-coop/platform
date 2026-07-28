import { describe, it, expect } from "vitest";
import { planWrite, TARGET_TOTAL_UNITS, type RegisterEntry } from "./plan";

function addr(n: number): string {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

const A = addr(0xa);
const B = addr(0xb);
const C = addr(0xc);

function totalUnits(entries: RegisterEntry[]): bigint {
  return entries.reduce((sum, e) => sum + e.units, 0n);
}

describe("planWrite normalization", () => {
  it("turns relative weights into parts per million", () => {
    const plan = planWrite(
      [
        { address: A, weight: 3 },
        { address: B, weight: 1 },
      ],
      [],
    );

    expect(plan.target).toEqual([
      { address: A, units: 750_000n },
      { address: B, units: 250_000n },
    ]);
  });

  it("never exceeds the target total, and may land just under it", () => {
    // An even three-way split cannot divide 1,000,000 exactly. The remainder is
    // dropped rather than handed to whichever address sorts first.
    const plan = planWrite(
      [
        { address: A, weight: 1 },
        { address: B, weight: 1 },
        { address: C, weight: 1 },
      ],
      [],
    );

    const total = totalUnits(plan.target);
    expect(total).toBeLessThan(TARGET_TOTAL_UNITS);
    expect(total).toBe(999_999n);
    expect(plan.target.map((e) => e.units)).toEqual([
      333_333n,
      333_333n,
      333_333n,
    ]);
  });

  it("treats arbitrary magnitudes as purely relative", () => {
    const small = planWrite(
      [
        { address: A, weight: 0.003 },
        { address: B, weight: 0.001 },
      ],
      [],
    );
    const large = planWrite(
      [
        { address: A, weight: 3_000_000 },
        { address: B, weight: 1_000_000 },
      ],
      [],
    );

    expect(small.target).toEqual(large.target);
  });

  it("gives zero units to a zero weight and to a weight that rounds to zero", () => {
    const plan = planWrite(
      [
        { address: A, weight: 1_000_000 },
        { address: B, weight: 0 },
        // Positive, but under half a millionth of the leader.
        { address: C, weight: 0.0000001 },
      ],
      [],
    );

    expect(plan.target.map((e) => e.address)).toEqual([A]);
  });
});

describe("planWrite diffing", () => {
  it("sends nothing when the chain already matches", () => {
    const current: RegisterEntry[] = [
      { address: A, units: 750_000n },
      { address: B, units: 250_000n },
    ];

    const plan = planWrite(
      [
        { address: A, weight: 3 },
        { address: B, weight: 1 },
      ],
      current,
    );

    expect(plan.unchanged).toBe(true);
    expect(plan.changed).toEqual([]);
    expect(plan.batches).toEqual([]);
  });

  it("zeroes a recipient the payload dropped", () => {
    const plan = planWrite(
      [{ address: A, weight: 1 }],
      [
        { address: A, units: 1_000_000n },
        { address: B, units: 250_000n },
      ],
    );

    expect(plan.changed).toContainEqual({ address: B, units: 0n });
    expect(plan.target.map((e) => e.address)).toEqual([A]);
  });

  it("leaves an already-zero former recipient alone", () => {
    // Nothing to write: the chain and the payload agree they hold nothing.
    const plan = planWrite(
      [{ address: A, weight: 1 }],
      [
        { address: A, units: 1_000_000n },
        { address: B, units: 0n },
      ],
    );

    expect(plan.unchanged).toBe(true);
  });

  it("batches only what moved, not the payload", () => {
    // A thousand recipients on a settled register, three of whom tick up. Since
    // batching works off the diff, this is one transaction rather than twenty.
    const recipients = Array.from({ length: 1000 }, (_, i) => ({
      address: addr(i + 1),
      weight: 1000 + ((i * 7919) % 5000),
    }));
    const settled = planWrite(recipients, []);

    const bumped = recipients.map((r, i) =>
      i < 3 ? { ...r, weight: r.weight + 1 } : r,
    );
    const plan = planWrite(bumped, settled.target);

    expect(plan.batches).toHaveLength(1);
    expect(plan.changed.length).toBeLessThanOrEqual(50);
  });

  it("re-proportions the whole register when a weight change shifts every share", () => {
    // Shares are relative, so how much moves depends on the size of the change,
    // not on how many weights the caller edited. Equal weights are the worst
    // case: 1000 recipients land on exactly 1000ppm each, so any change to the
    // total pushes every one of them across a rounding boundary at once.
    const recipients = Array.from({ length: 1000 }, (_, i) => ({
      address: addr(i + 1),
      weight: 1,
    }));
    const settled = planWrite(recipients, []);

    const bumped = recipients.map((r, i) =>
      i === 7 ? { ...r, weight: 1.5 } : r,
    );
    const plan = planWrite(bumped, settled.target);

    expect(plan.changed.length).toBeGreaterThan(900);
  });

  it("splits a large diff into chunks of fifty", () => {
    const recipients = Array.from({ length: 120 }, (_, i) => ({
      address: addr(i + 1),
      weight: 1,
    }));

    const plan = planWrite(recipients, []);

    expect(plan.batches.map((b) => b.length)).toEqual([50, 50, 20]);
  });

  it("adds recipients that are not in the pool yet", () => {
    const plan = planWrite(
      [
        { address: A, weight: 1 },
        { address: B, weight: 1 },
      ],
      [{ address: A, units: 1_000_000n }],
    );

    expect(plan.changed).toContainEqual({ address: B, units: 500_000n });
  });

  it("is case-insensitive about addresses on both sides", () => {
    const plan = planWrite(
      [{ address: A.toUpperCase(), weight: 1 }],
      [{ address: A, units: 1_000_000n }],
    );

    expect(plan.unchanged).toBe(true);
  });

  it("converges: replanning after a partial write is smaller than the first attempt", () => {
    const recipients = Array.from({ length: 120 }, (_, i) => ({
      address: addr(i + 1),
      weight: i + 1,
    }));

    const first = planWrite(recipients, []);
    expect(first.batches).toHaveLength(3);

    // Only the first batch landed; replanning against that state has to write
    // strictly less than the original attempt.
    const landed = first.batches[0];
    const second = planWrite(recipients, landed);

    expect(second.changed.length).toBeLessThan(first.changed.length);
    expect(second.batches.length).toBeLessThan(first.batches.length);
  });
});
