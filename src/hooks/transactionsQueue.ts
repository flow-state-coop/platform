import { useState } from "react";
import {
  useChainId,
  usePublicClient,
  useWalletClient,
  useCapabilities,
  useSendCallsSync,
} from "wagmi";
import { TransactionCall } from "@/types/transactionCall";

function isRejectionError(err: Record<string, unknown>) {
  return (
    err.code === "ACTION_REJECTED" ||
    err.code === 4001 ||
    err.name === "UserRejectedRequestError"
  );
}

const REVERT_ERROR_MESSAGES: Record<string, string> = {
  "0xea76c9b3": "Insufficient super token balance to cover the stream deposit",
};

function getRevertSelector(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const revertData =
    e?.error?.data?.originalError?.data ??
    e?.error?.data ??
    e?.data?.originalError?.data ??
    e?.data?.data;

  if (typeof revertData === "string" && revertData.startsWith("0x")) {
    return revertData.slice(0, 10);
  }

  return null;
}

function getTransactionErrorMessage(err: Record<string, unknown>): string {
  if (isRejectionError(err)) {
    return "Transaction rejected";
  }

  if (err.code === "INSUFFICIENT_FUNDS") {
    return "Not enough funds to cover gas";
  }

  const selector = getRevertSelector(err);

  if (selector && REVERT_ERROR_MESSAGES[selector]) {
    return REVERT_ERROR_MESSAGES[selector];
  }

  return "An error occurred executing the transaction";
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

  const isBatchSupported = !!capabilities?.[chainId]?.atomicBatch?.supported;

  const executeTransactions = async (calls: TransactionCall[]) => {
    setAreTransactionsLoading(true);
    setTransactionError("");
    setCompletedTransactions(0);

    try {
      if (isBatchSupported && calls.length > 1) {
        await sendCallsSyncAsync({
          calls: calls.map((call) => ({
            to: call.to,
            data: call.data,
            ...(call.value ? { value: call.value } : {}),
          })),
        });

        setCompletedTransactions(calls.length);
      } else {
        if (!walletClient || !publicClient) {
          throw new Error("Wallet not connected");
        }

        for (const call of calls) {
          await publicClient.call({
            to: call.to,
            data: call.data,
            value: call.value,
            account: walletClient.account,
          });

          const hash = await walletClient.sendTransaction({
            to: call.to,
            data: call.data,
            value: call.value,
            chain: walletClient.chain,
          });

          await publicClient.waitForTransactionReceipt({
            hash,
            confirmations: 3,
          });

          setCompletedTransactions((prev) => prev + 1);
        }
      }

      setAreTransactionsLoading(false);
      setCompletedTransactions(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setTransactionError(getTransactionErrorMessage(err));
      setCompletedTransactions(0);
      setAreTransactionsLoading(false);

      throw err;
    }
  };

  const executeWithProgress = async (
    fn: (onProgress: () => void) => Promise<void>,
  ) => {
    setAreTransactionsLoading(true);
    setTransactionError("");
    setCompletedTransactions(0);

    try {
      await fn(() => setCompletedTransactions((prev) => prev + 1));

      setAreTransactionsLoading(false);
      setCompletedTransactions(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setTransactionError(getTransactionErrorMessage(err));
      setCompletedTransactions(0);
      setAreTransactionsLoading(false);

      throw err;
    }
  };

  return {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    isBatchSupported,
    executeTransactions,
    executeWithProgress,
  };
}
