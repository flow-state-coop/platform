import { useState } from "react";
import { TransactionReceipt } from "viem";
import {
  useChainId,
  usePublicClient,
  useWalletClient,
  useCapabilities,
  useSendCallsSync,
} from "wagmi";
import { TransactionCall } from "@/lib/transactionCalls";

function isRejectionError(err: Record<string, unknown>) {
  return (
    err.code === "ACTION_REJECTED" ||
    err.code === 4001 ||
    err.name === "UserRejectedRequestError"
  );
}

export default function useTransactionsQueue() {
  const [transactionError, setTransactionError] = useState("");
  const [areTransactionsLoading, setAreTransactionsLoading] = useState(false);
  const [completedTransactions, setCompletedTransactions] = useState(0);

  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: capabilities } = useCapabilities();
  const { sendCallsSyncAsync } = useSendCallsSync();

  const isBatchSupported = !!capabilities?.[chainId];

  const executeTransactions = async (
    calls: TransactionCall[],
  ): Promise<TransactionReceipt[]> => {
    setAreTransactionsLoading(true);
    setTransactionError("");
    setCompletedTransactions(0);

    try {
      let receipts: TransactionReceipt[];

      if (isBatchSupported && calls.length > 1) {
        const result = await sendCallsSyncAsync({
          calls: calls.map((call) => ({
            to: call.to,
            data: call.data,
            ...(call.value ? { value: call.value } : {}),
          })),
        });

        receipts = (result.receipts ?? []) as TransactionReceipt[];
      } else {
        receipts = [];

        for (const call of calls) {
          const hash = await walletClient!.sendTransaction({
            to: call.to,
            data: call.data,
            value: call.value,
            chain: walletClient!.chain,
          });

          const receipt = await publicClient!.waitForTransactionReceipt({
            hash,
          });

          receipts.push(receipt);
          setCompletedTransactions((prev) => prev + 1);
        }
      }

      setAreTransactionsLoading(false);
      setCompletedTransactions(0);

      return receipts;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      let errorMessage = "An error occured executing the transaction";

      if (isRejectionError(err)) {
        errorMessage = "Transaction rejected";
      }

      setTransactionError(errorMessage);
      setCompletedTransactions(0);
      setAreTransactionsLoading(false);

      throw Error(err);
    }
  };

  const executeLegacyTransactions = async (
    transactions: (() => Promise<void>)[],
  ) => {
    setAreTransactionsLoading(true);
    setTransactionError("");

    try {
      for (const transaction of transactions) {
        await transaction();

        setCompletedTransactions((prev) => prev + 1);
      }

      setAreTransactionsLoading(false);
      setCompletedTransactions(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      let errorMessage = "An error occured executing the transaction";

      if (isRejectionError(err)) {
        errorMessage = "Transaction rejected";
      }

      setTransactionError(errorMessage);
      setCompletedTransactions(0);
      setAreTransactionsLoading(false);

      throw Error(err);
    }
  };

  return {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    isBatchSupported,
    executeTransactions,
    executeLegacyTransactions,
  };
}
