import { describe, it, expect } from "vitest";
import {
  type IndexedSuperAppFunders,
  parseSuperAppFunderReads,
  reconcileSuperAppFunders,
} from "./superAppFunders";

const MONTH = 2628000n;
const perMonth = (amount: bigint) => amount / MONTH;

const indexed: IndexedSuperAppFunders = {
  totalInflowRate: perMonth(11_000_000n * 10n ** 18n).toString(),
  totalNetFlowRate: "8422993449662985938",
  totalAmountStreamedInUntilUpdatedAt: (19_000_000n * 10n ** 18n).toString(),
  updatedAtTimestamp: 1_787_890_074,
  funderCount: 2,
  senders: ["0xaaaa", "0xbbbb"],
};

const pool = {
  totalAmountFlowedDistributedUntilUpdatedAt: (
    161_500_000n *
    10n ** 18n
  ).toString(),
  updatedAtTimestamp: 1_787_904_508,
};

const success = (result: bigint) => ({ status: "success" as const, result });
const failure = () => ({ status: "failure" as const, error: new Error() });

describe("parseSuperAppFunderReads", () => {
  it("returns undefined until every read has succeeded", () => {
    expect(parseSuperAppFunderReads(undefined, 1)).toBeUndefined();
    expect(
      parseSuperAppFunderReads(
        [success(1n), failure(), success(50n), success(1n)],
        1,
      ),
    ).toBeUndefined();
    expect(
      parseSuperAppFunderReads([success(1n), success(-1n), success(50n)], 1),
    ).toBeUndefined();
  });

  it("clamps the inflow at zero and nets the GDA outflow", () => {
    expect(
      parseSuperAppFunderReads(
        [success(100n), success(-95n), success(50n), success(60n)],
        1,
      ),
    ).toEqual({
      inflowRate: 100n,
      netFlowRate: 5n,
      feePermille: 50n,
      senderFlowRates: [60n],
    });
    expect(
      parseSuperAppFunderReads([success(-3n), success(0n), success(50n)], 0),
    ).toMatchObject({ inflowRate: 0n });
  });
});

describe("reconcileSuperAppFunders", () => {
  it("keeps the indexed snapshot when the chain agrees with it", () => {
    const result = reconcileSuperAppFunders({
      indexed,
      onChain: {
        inflowRate: BigInt(indexed.totalInflowRate),
        netFlowRate: 1n,
        feePermille: 50n,
        senderFlowRates: [perMonth(10_000_000n * 10n ** 18n), 1n],
      },
      pool,
    });

    expect(result).toEqual({
      totalInflowRate: indexed.totalInflowRate,
      totalNetFlowRate: indexed.totalNetFlowRate,
      totalAmountStreamedInUntilUpdatedAt:
        indexed.totalAmountStreamedInUntilUpdatedAt,
      updatedAtTimestamp: indexed.updatedAtTimestamp,
      funderCount: 2,
    });
  });

  it("falls back to the indexed snapshot when the chain reads are unavailable", () => {
    expect(
      reconcileSuperAppFunders({ indexed, onChain: undefined, pool }),
    ).toMatchObject({ totalInflowRate: indexed.totalInflowRate });
    expect(
      reconcileSuperAppFunders({
        indexed: undefined,
        onChain: undefined,
        pool,
      }),
    ).toBeUndefined();
  });

  it("uses the chain when the indexer missed a large funder and kept a closed one", () => {
    const chainInflow = perMonth(140_015_000n * 10n ** 18n);
    const smallFunder = perMonth(15_000n * 10n ** 18n);
    const result = reconcileSuperAppFunders({
      indexed,
      onChain: {
        inflowRate: chainInflow,
        netFlowRate: perMonth(7_000_000n * 10n ** 18n),
        feePermille: 50n,
        senderFlowRates: [0n, smallFunder],
      },
      pool,
    });

    expect(result).toEqual({
      totalInflowRate: chainInflow.toString(),
      totalNetFlowRate: perMonth(7_000_000n * 10n ** 18n).toString(),
      totalAmountStreamedInUntilUpdatedAt: (
        (BigInt(pool.totalAmountFlowedDistributedUntilUpdatedAt) * 1000n) /
        950n
      ).toString(),
      updatedAtTimestamp: pool.updatedAtTimestamp,
      funderCount: 2,
    });
  });

  it("drops closed streams without inventing an extra funder", () => {
    const remaining = perMonth(10_000_000n * 10n ** 18n);
    const result = reconcileSuperAppFunders({
      indexed,
      onChain: {
        inflowRate: remaining,
        netFlowRate: 0n,
        feePermille: 50n,
        senderFlowRates: [remaining, 0n],
      },
      pool: undefined,
    });

    expect(result).toMatchObject({
      totalInflowRate: remaining.toString(),
      totalAmountStreamedInUntilUpdatedAt:
        indexed.totalAmountStreamedInUntilUpdatedAt,
      updatedAtTimestamp: indexed.updatedAtTimestamp,
      funderCount: 1,
    });
  });

  it("reports an unindexed splitter from the chain alone", () => {
    const onChain = {
      inflowRate: 0n,
      netFlowRate: 0n,
      feePermille: 50n,
      senderFlowRates: [],
    };

    expect(
      reconcileSuperAppFunders({ indexed: undefined, onChain, pool }),
    ).toBeUndefined();
    expect(
      reconcileSuperAppFunders({
        indexed: undefined,
        onChain: { ...onChain, inflowRate: 7n },
        pool,
      }),
    ).toMatchObject({ totalInflowRate: "7", funderCount: 1 });
  });
});
