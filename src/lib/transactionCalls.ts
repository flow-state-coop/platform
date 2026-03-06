import { Address, Hex } from "viem";
import { Operation, Framework } from "@superfluid-finance/sdk-core";

export type TransactionCall = {
  to: Address;
  data: Hex;
  value?: bigint;
};

export async function operationToCall(
  operation: Operation,
): Promise<TransactionCall> {
  const populated = await operation.populateTransactionPromise;

  return {
    to: populated.to as Address,
    data: populated.data as Hex,
    value: populated.value ? BigInt(populated.value.toString()) : undefined,
  };
}

export async function batchOperationsToCall(
  sfFramework: Framework,
  operations: Operation[],
): Promise<TransactionCall> {
  const batchOp = await sfFramework.batchCall(operations).toOperation();

  return operationToCall(batchOp);
}
