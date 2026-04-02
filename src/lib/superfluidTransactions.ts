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

export function buildFlowBatchOps({
  tokenAddress,
  senderAddress,
  receiverAddress,
  newFlowRate,
  flowRateToReceiver,
  chainId,
}: {
  tokenAddress: Address;
  senderAddress: Address;
  receiverAddress: Address;
  newFlowRate: string;
  flowRateToReceiver: string;
  chainId: keyof typeof cfaAddress;
}): BatchOp[] {
  if (BigInt(newFlowRate) === BigInt(0) && BigInt(flowRateToReceiver) === BigInt(0)) {
    return [];
  }

  if (BigInt(newFlowRate) === BigInt(0) && BigInt(flowRateToReceiver) > 0) {
    return [
      prepareOperation({
        operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
        target: cfaAddress[chainId],
        data: encodeFunctionData({
          abi: cfaAbi,
          functionName: "deleteFlow",
          args: [tokenAddress, senderAddress, receiverAddress, "0x"],
        }),
      }),
    ];
  }

  if (BigInt(flowRateToReceiver) > 0) {
    return [
      prepareOperation({
        operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
        target: cfaAddress[chainId],
        data: encodeFunctionData({
          abi: cfaAbi,
          functionName: "updateFlow",
          args: [tokenAddress, receiverAddress, BigInt(newFlowRate), "0x"],
        }),
      }),
    ];
  }

  return [
    prepareOperation({
      operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
      target: cfaAddress[chainId],
      data: encodeFunctionData({
        abi: cfaAbi,
        functionName: "createFlow",
        args: [tokenAddress, receiverAddress, BigInt(newFlowRate), "0x"],
      }),
    }),
  ];
}

export function buildDeleteFlowBatchOps({
  tokenAddress,
  senderAddress,
  receiverAddress,
  chainId,
}: {
  tokenAddress: Address;
  senderAddress: Address;
  receiverAddress: Address;
  chainId: keyof typeof cfaAddress;
}): BatchOp[] {
  return [
    prepareOperation({
      operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
      target: cfaAddress[chainId],
      data: encodeFunctionData({
        abi: cfaAbi,
        functionName: "deleteFlow",
        args: [tokenAddress, senderAddress, receiverAddress, "0x"],
      }),
    }),
  ];
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
