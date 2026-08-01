import { erc20Abi, parseEventLogs, type Address, type Log } from "viem";
import { SPLITTER_UNLOCK_PRICE } from "@/lib/splitterUnlock";

export type UnlockPayment = {
  payer: Address;
  amount: bigint;
};

/**
 * The payment inside an arbitrary receipt: ERC-20 Transfer events of the
 * expected token to the expected receiver, summed. Summed rather than taking
 * the largest, so a payment routed through a contract that splits it into
 * several transfers still counts, and every other event in the receipt is
 * ignored rather than trusted.
 *
 * The payer reported is the funds' source in the first counted transfer, which
 * is what belongs in the payment record; who may claim the receipt is the
 * route's decision, made on the transaction's sender.
 */
export function findUnlockPayment(
  receipt: { logs: Log[] },
  { token, receiver }: { token: Address; receiver: Address },
): UnlockPayment | null {
  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
  }).filter(
    (log) =>
      log.address.toLowerCase() === token.toLowerCase() &&
      log.args.to.toLowerCase() === receiver.toLowerCase(),
  );

  const amount = transfers.reduce((sum, log) => sum + log.args.value, 0n);

  if (amount < SPLITTER_UNLOCK_PRICE) {
    return null;
  }

  return { payer: transfers[0].args.from, amount };
}
