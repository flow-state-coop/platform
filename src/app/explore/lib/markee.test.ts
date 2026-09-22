import { describe, expect, it } from "vitest";
import { decodeAbiParameters, parseEther } from "viem";
import { OPERATION_TYPE } from "@sfpro/sdk/constant";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import {
  BUFFER_PERIOD_SECONDS,
  ETHX,
  FLOW_STATE_MARKEE_ADDRESS,
  SUPERFLUID_HOST,
  buildStreamCalls,
  buildStreamOps,
  computeStreamFunding,
  isBelowMinimumRate,
  monthlyToOvertake,
  monthlyToRatePerSec,
} from "./markee";

const MONTH = BigInt(SECONDS_IN_MONTH);
const MINIMUM_MONTHLY_RATE = 999999997884000n;
const BACKER = "0xdddddddddddddddddddddddddddddddddddddddd" as const;
const MARKEE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
const POOL = "0x1111111111111111111111111111111111111111" as const;
const CFA = "0x2222222222222222222222222222222222222222" as const;
const GDA = "0x3333333333333333333333333333333333333333" as const;

const streamParams = {
  backer: BACKER,
  markee: MARKEE,
  pool: POOL,
  ratePerSec: 380517503n,
  depositTopUp: 380517503n * BUFFER_PERIOD_SECONDS,
  wrapValue: parseEther("0.004"),
  cfaAgreement: CFA,
  gdaAgreement: GDA,
};

describe("monthlyToRatePerSec", () => {
  it("floors a round amount when the board minimum sits just under it", () => {
    const rate = monthlyToRatePerSec(parseEther("0.001"), MINIMUM_MONTHLY_RATE);

    expect(rate).toBe(380517503n);
    expect(isBelowMinimumRate(rate, MINIMUM_MONTHLY_RATE)).toBe(false);
  });

  it("rounds up when flooring would undershoot the minimum", () => {
    const rate = monthlyToRatePerSec(parseEther("0.001"), parseEther("0.001"));

    expect(rate * MONTH).toBeGreaterThanOrEqual(parseEther("0.001"));
  });
});

describe("monthlyToOvertake", () => {
  it("yields a monthly amount whose floored rate beats the top rate", () => {
    const topRate = 380517503n;
    const monthly = monthlyToOvertake(topRate, 0n);

    expect(monthlyToRatePerSec(monthly, MINIMUM_MONTHLY_RATE)).toBeGreaterThan(
      topRate,
    );
  });

  it("only covers the gap when the target already streams part of it", () => {
    expect(monthlyToOvertake(1000n, 400n)).toBe(monthlyToOvertake(600n, 0n));
  });
});

describe("computeStreamFunding", () => {
  it("skips the wrap when the ETHx balance already covers the runway", () => {
    const funding = computeStreamFunding({
      ratePerSec: 380517503n,
      ethxBalance: parseEther("1"),
      ethBalance: parseEther("1"),
      existingDeposit: 0n,
    });

    expect(funding.wrapValue).toBe(0n);
    expect(funding.depositTopUp).toBe(380517503n * BUFFER_PERIOD_SECONDS);
    expect(funding.isInsufficient).toBe(false);
  });

  it("wraps the shortfall capped by the spendable ETH balance", () => {
    const funding = computeStreamFunding({
      ratePerSec: 380517503n,
      ethxBalance: 0n,
      ethBalance: parseEther("0.002"),
      existingDeposit: 0n,
    });

    expect(funding.wrapValue).toBe(parseEther("0.001"));
    expect(funding.prefund).toBe(parseEther("0.001") - funding.depositTopUp);
    expect(funding.isInsufficient).toBe(false);
  });

  it("only tops up the deposit the board is missing", () => {
    const funding = computeStreamFunding({
      ratePerSec: 380517503n,
      ethxBalance: parseEther("1"),
      ethBalance: 0n,
      existingDeposit: 380517503n * BUFFER_PERIOD_SECONDS,
    });

    expect(funding.depositTopUp).toBe(0n);
  });

  it("flags a wallet that cannot clear the stream buffer", () => {
    const funding = computeStreamFunding({
      ratePerSec: 380517503n,
      ethxBalance: 0n,
      ethBalance: parseEther("0.001"),
      existingDeposit: 0n,
    });

    expect(funding.isInsufficient).toBe(true);
  });
});

describe("buildStreamOps", () => {
  it("opens with wrap, deposit, tagged createFlow, then connectPool", () => {
    const ops = buildStreamOps({ mode: "open", ...streamParams });

    expect(ops.map((op) => op.operationType)).toEqual([
      OPERATION_TYPE.SIMPLE_FORWARD_CALL,
      OPERATION_TYPE.SIMPLE_FORWARD_CALL,
      OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
      OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    ]);
    expect(ops[0].target).toBe(ETHX);
    expect(ops[1].target).toBe(FLOW_STATE_MARKEE_ADDRESS);
    expect(ops[2].target).toBe(CFA);
    expect(ops[3].target).toBe(GDA);

    const [, userData] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      ops[2].data,
    );
    const [taggedMarkee] = decodeAbiParameters([{ type: "address" }], userData);

    expect(taggedMarkee.toLowerCase()).toBe(MARKEE);
  });

  it("updates in place without re-tagging or reconnecting", () => {
    const ops = buildStreamOps({
      mode: "update",
      ...streamParams,
      wrapValue: 0n,
      depositTopUp: 0n,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0].target).toBe(CFA);
  });

  it("moves by deleting the old flow before the tagged create", () => {
    const ops = buildStreamOps({ mode: "move", ...streamParams });

    expect(ops.map((op) => op.target)).toEqual([
      ETHX,
      FLOW_STATE_MARKEE_ADDRESS,
      CFA,
      CFA,
      GDA,
    ]);
  });
});

describe("buildStreamCalls", () => {
  it("sends the approve as its own call only when the allowance is short", () => {
    const withApprove = buildStreamCalls({
      mode: "open",
      ...streamParams,
      allowance: 0n,
    });
    const withoutApprove = buildStreamCalls({
      mode: "open",
      ...streamParams,
      allowance: streamParams.depositTopUp,
    });

    expect(withApprove).toHaveLength(2);
    expect(withApprove[0].to).toBe(ETHX);
    expect(withApprove[1].to).toBe(SUPERFLUID_HOST);
    expect(withApprove[1].value).toBe(streamParams.wrapValue);
    expect(withoutApprove).toHaveLength(1);
  });
});
