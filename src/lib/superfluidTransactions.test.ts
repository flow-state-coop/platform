import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { superTokenAbi } from "@sfpro/sdk/abi";
import { hostAbi, hostAddress, cfaAbi, cfaAddress } from "@sfpro/sdk/abi/core";
import { OPERATION_TYPE } from "@sfpro/sdk/constant";
import {
  buildWrapCalls,
  buildCreateFlowBatchOp,
  buildUpdateFlowBatchOp,
  buildDeleteFlowBatchOp,
  buildBatchCall,
} from "./superfluidTransactions";

// OP Sepolia — confirmed present in cfaAddress and hostAddress
const CHAIN_ID = 11155420 as const;

const TOKEN_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const UNDERLYING_ADDRESS =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const RECEIVER_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc" as const;
const SENDER_ADDRESS = "0xdddddddddddddddddddddddddddddddddddddddd" as const;
const WRAP_AMOUNT_WEI = 1_000_000_000_000_000_000n;
const WRAP_AMOUNT_UNITS = 1_000_000n;
const FLOW_RATE = 317_097_919n;

describe("buildWrapCalls", () => {
  it("isSuperTokenWrapper=true, needsApproval=true: produces approve call then upgrade batchOp", () => {
    const { calls, batchOps } = buildWrapCalls({
      tokenAddress: TOKEN_ADDRESS,
      wrapAmountWei: WRAP_AMOUNT_WEI,
      wrapAmountUnits: WRAP_AMOUNT_UNITS,
      isSuperTokenWrapper: true,
      isSuperTokenNative: false,
      tokenUnderlyingAddress: UNDERLYING_ADDRESS,
      needsApproval: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(UNDERLYING_ADDRESS);
    expect(calls[0].data).toBe(
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [TOKEN_ADDRESS, WRAP_AMOUNT_UNITS],
      }),
    );

    expect(batchOps).toHaveLength(1);
    expect(batchOps[0].operationType).toBe(OPERATION_TYPE.SUPERTOKEN_UPGRADE);
    expect(batchOps[0].target).toBe(TOKEN_ADDRESS);
  });

  it("isSuperTokenWrapper=true, needsApproval=false: skips approve call but emits upgrade batchOp", () => {
    const { calls, batchOps } = buildWrapCalls({
      tokenAddress: TOKEN_ADDRESS,
      wrapAmountWei: WRAP_AMOUNT_WEI,
      wrapAmountUnits: WRAP_AMOUNT_UNITS,
      isSuperTokenWrapper: true,
      isSuperTokenNative: false,
      tokenUnderlyingAddress: UNDERLYING_ADDRESS,
      needsApproval: false,
    });

    expect(calls).toHaveLength(0);
    expect(batchOps).toHaveLength(1);
    expect(batchOps[0].operationType).toBe(OPERATION_TYPE.SUPERTOKEN_UPGRADE);
    expect(batchOps[0].target).toBe(TOKEN_ADDRESS);
  });

  it("isSuperTokenNative=true: emits upgradeByETH call with value, no batchOps", () => {
    const { calls, batchOps } = buildWrapCalls({
      tokenAddress: TOKEN_ADDRESS,
      wrapAmountWei: WRAP_AMOUNT_WEI,
      wrapAmountUnits: WRAP_AMOUNT_UNITS,
      isSuperTokenWrapper: false,
      isSuperTokenNative: true,
      needsApproval: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(TOKEN_ADDRESS);
    expect(calls[0].value).toBe(WRAP_AMOUNT_WEI);
    expect(calls[0].data).toBe(
      encodeFunctionData({
        abi: superTokenAbi,
        functionName: "upgradeByETH",
        args: [],
      }),
    );
    expect(batchOps).toHaveLength(0);
  });

  it("neither wrapper nor native: both arrays empty", () => {
    const { calls, batchOps } = buildWrapCalls({
      tokenAddress: TOKEN_ADDRESS,
      wrapAmountWei: WRAP_AMOUNT_WEI,
      wrapAmountUnits: WRAP_AMOUNT_UNITS,
      isSuperTokenWrapper: false,
      isSuperTokenNative: false,
      needsApproval: false,
    });

    expect(calls).toHaveLength(0);
    expect(batchOps).toHaveLength(0);
  });
});

describe("buildCreateFlowBatchOp", () => {
  it("has SUPERFLUID_CALL_AGREEMENT operationType", () => {
    const op = buildCreateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    expect(op.operationType).toBe(OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT);
  });

  it("targets cfaAddress for the given chainId", () => {
    const op = buildCreateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    expect(op.target).toBe(cfaAddress[CHAIN_ID]);
  });

  it("data round-trips with encodeFunctionData createFlow", () => {
    const op = buildCreateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    const expectedCallData = encodeFunctionData({
      abi: cfaAbi,
      functionName: "createFlow",
      args: [TOKEN_ADDRESS, RECEIVER_ADDRESS, FLOW_RATE, "0x"],
    });

    // op.data wraps callData inside a prepareOperation envelope; the raw
    // callData must appear somewhere in the encoded output.
    expect(op.data).toContain(expectedCallData.slice(2));
  });
});

describe("buildUpdateFlowBatchOp", () => {
  it("has SUPERFLUID_CALL_AGREEMENT operationType", () => {
    const op = buildUpdateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    expect(op.operationType).toBe(OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT);
  });

  it("targets cfaAddress for the given chainId", () => {
    const op = buildUpdateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    expect(op.target).toBe(cfaAddress[CHAIN_ID]);
  });

  it("data round-trips with encodeFunctionData updateFlow", () => {
    const op = buildUpdateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    const expectedCallData = encodeFunctionData({
      abi: cfaAbi,
      functionName: "updateFlow",
      args: [TOKEN_ADDRESS, RECEIVER_ADDRESS, FLOW_RATE, "0x"],
    });

    expect(op.data).toContain(expectedCallData.slice(2));
  });
});

describe("buildDeleteFlowBatchOp", () => {
  it("has SUPERFLUID_CALL_AGREEMENT operationType", () => {
    const op = buildDeleteFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      senderAddress: SENDER_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      chainId: CHAIN_ID,
    });

    expect(op.operationType).toBe(OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT);
  });

  it("targets cfaAddress for the given chainId", () => {
    const op = buildDeleteFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      senderAddress: SENDER_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      chainId: CHAIN_ID,
    });

    expect(op.target).toBe(cfaAddress[CHAIN_ID]);
  });

  it("data round-trips with encodeFunctionData deleteFlow", () => {
    const op = buildDeleteFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      senderAddress: SENDER_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      chainId: CHAIN_ID,
    });

    const expectedCallData = encodeFunctionData({
      abi: cfaAbi,
      functionName: "deleteFlow",
      args: [TOKEN_ADDRESS, SENDER_ADDRESS, RECEIVER_ADDRESS, "0x"],
    });

    expect(op.data).toContain(expectedCallData.slice(2));
  });
});

describe("buildBatchCall", () => {
  it("returns null for empty batchOps array", () => {
    expect(buildBatchCall([], CHAIN_ID)).toBeNull();
  });

  it("returns transaction targeting hostAddress for the given chainId", () => {
    const op = buildCreateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    const tx = buildBatchCall([op], CHAIN_ID);

    expect(tx).not.toBeNull();
    expect(tx!.to).toBe(hostAddress[CHAIN_ID]);
  });

  it("data encodes all batchOps via hostAbi batchCall", () => {
    const op = buildCreateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });

    const tx = buildBatchCall([op], CHAIN_ID);

    const expected = encodeFunctionData({
      abi: hostAbi,
      functionName: "batchCall",
      args: [[op]],
    });

    expect(tx!.data).toBe(expected);
  });

  it("encodes multiple batchOps in a single call", () => {
    const createOp = buildCreateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE,
      chainId: CHAIN_ID,
    });
    const updateOp = buildUpdateFlowBatchOp({
      tokenAddress: TOKEN_ADDRESS,
      receiverAddress: RECEIVER_ADDRESS,
      flowRate: FLOW_RATE * 2n,
      chainId: CHAIN_ID,
    });

    const tx = buildBatchCall([createOp, updateOp], CHAIN_ID);

    const expected = encodeFunctionData({
      abi: hostAbi,
      functionName: "batchCall",
      args: [[createOp, updateOp]],
    });

    expect(tx!.data).toBe(expected);
  });
});
