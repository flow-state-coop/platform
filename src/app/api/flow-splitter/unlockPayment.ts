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
 * With `payer` set, only transfers leaving that address count. The route uses
 * this when the claimer did not send the transaction (a contract wallet whose
 * executor broadcast it), so another party's funds in the same receipt cannot
 * satisfy the price. Without it, the payer reported is the funds' source in
 * the first counted transfer, a best-effort audit field: a payment routed
 * through an intermediary can draw on several sources and only the first is
 * recorded. Who may claim the receipt never rests on that field; the route
 * decides it on the transaction's sender or the filter here.
 */
export function findUnlockPayment(
  receipt: { logs: Log[] },
  {
    token,
    receiver,
    payer,
  }: { token: Address; receiver: Address; payer?: Address },
): UnlockPayment | null {
  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
  }).filter(
    (log) =>
      log.address.toLowerCase() === token.toLowerCase() &&
      log.args.to.toLowerCase() === receiver.toLowerCase() &&
      (!payer || log.args.from.toLowerCase() === payer.toLowerCase()),
  );

  const amount = transfers.reduce((sum, log) => sum + log.args.value, 0n);

  if (amount < SPLITTER_UNLOCK_PRICE) {
    return null;
  }

  return { payer: transfers[0].args.from, amount };
}
