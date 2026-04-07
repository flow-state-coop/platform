import { Address, encodeFunctionData, erc20Abi } from "viem";
import { superTokenAbi } from "@sfpro/sdk/abi";
import { hostAbi, hostAddress, cfaAbi, cfaAddress } from "@sfpro/sdk/abi/core";
import { prepareOperation, OPERATION_TYPE } from "@sfpro/sdk/constant";
import { TransactionCall } from "@/types/transactionCall";

type BatchOp = {
  operationType: number;
  target: Address;
  data: `0x${string}`;
};

export function buildWrapCalls({
  tokenAddress,
  wrapAmountWei,
  wrapAmountUnits,
  isSuperTokenWrapper,
  isSuperTokenNative,
  tokenUnderlyingAddress,
  needsApproval,
}: {
  tokenAddress: Address;
  wrapAmountWei: bigint;
  wrapAmountUnits: bigint;
  isSuperTokenWrapper: boolean;
  isSuperTokenNative: boolean;
  tokenUnderlyingAddress?: Address;
  needsApproval: boolean;
}): { calls: TransactionCall[]; batchOps: BatchOp[] } {
  const calls: TransactionCall[] = [];
  const batchOps: BatchOp[] = [];

  if (isSuperTokenWrapper && tokenUnderlyingAddress && needsApproval) {
    calls.push({
      to: tokenUnderlyingAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [tokenAddress, wrapAmountUnits],
      }),
    });
  }

  if (isSuperTokenWrapper) {
    batchOps.push(
      prepareOperation({
        operationType: OPERATION_TYPE.SUPERTOKEN_UPGRADE,
        target: tokenAddress,
        data: encodeFunctionData({
          abi: superTokenAbi,
          functionName: "upgrade",
          args: [wrapAmountWei],
        }),
      }),
    );
  } else if (isSuperTokenNative) {
    calls.push({
      to: tokenAddress,
      data: encodeFunctionData({
        abi: superTokenAbi,
        functionName: "upgradeByETH",
        args: [],
      }),
      value: wrapAmountWei,
    });
  }

  return { calls, batchOps };
}

type FlowParams = {
  tokenAddress: Address;
  receiverAddress: Address;
  flowRate: bigint;
  chainId: keyof typeof cfaAddress;
};

type DeleteFlowParams = {
  tokenAddress: Address;
  senderAddress: Address;
  receiverAddress: Address;
  chainId: keyof typeof cfaAddress;
};

export function buildCreateFlowBatchOp({
  tokenAddress,
  receiverAddress,
  flowRate,
  chainId,
}: FlowParams): BatchOp {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: cfaAddress[chainId],
    data: encodeFunctionData({
      abi: cfaAbi,
      functionName: "createFlow",
      args: [tokenAddress, receiverAddress, flowRate, "0x"],
    }),
  });
}

export function buildUpdateFlowBatchOp({
  tokenAddress,
  receiverAddress,
  flowRate,
  chainId,
}: FlowParams): BatchOp {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: cfaAddress[chainId],
    data: encodeFunctionData({
      abi: cfaAbi,
      functionName: "updateFlow",
      args: [tokenAddress, receiverAddress, flowRate, "0x"],
    }),
  });
}

export function buildDeleteFlowBatchOp({
  tokenAddress,
  senderAddress,
  receiverAddress,
  chainId,
}: DeleteFlowParams): BatchOp {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: cfaAddress[chainId],
    data: encodeFunctionData({
      abi: cfaAbi,
      functionName: "deleteFlow",
      args: [tokenAddress, senderAddress, receiverAddress, "0x"],
    }),
  });
}

export function buildBatchCall(
  batchOps: BatchOp[],
  chainId: keyof typeof hostAddress,
): TransactionCall | null {
  if (batchOps.length === 0) return null;

  return {
    to: hostAddress[chainId],
    data: encodeFunctionData({
      abi: hostAbi,
      functionName: "batchCall",
      args: [batchOps],
    }),
  };
}
