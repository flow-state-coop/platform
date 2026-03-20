import { useState } from "react";

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

export default function useTransactionsQueue() {
  const [transactionError, setTransactionError] = useState("");
  const [areTransactionsLoading, setAreTransactionsLoading] = useState(false);
  const [completedTransactions, setCompletedTransactions] = useState(0);

  const executeTransactions = async (transactions: (() => Promise<void>)[]) => {
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
      console.error("Transaction failed:", err);

      let errorMessage = "An error occured executing the transaction";

      if (err.code === "ACTION_REJECTED") {
        errorMessage = "Transaction rejected";
      } else if (err.code === "INSUFFICIENT_FUNDS") {
        errorMessage = "Not enough funds to cover gas";
      } else {
        const selector = getRevertSelector(err);

        if (selector && REVERT_ERROR_MESSAGES[selector]) {
          errorMessage = REVERT_ERROR_MESSAGES[selector];
        }
      }

      setTransactionError(errorMessage);
      setCompletedTransactions(0);
      setAreTransactionsLoading(false);

      throw err;
    }
  };

  return {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  };
}
