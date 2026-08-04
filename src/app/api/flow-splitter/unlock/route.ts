import { TransactionReceiptNotFoundError, type Address } from "viem";
import { db } from "../../db";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import { authorizePoolAdmin } from "../auth";
import { getSplitterPublicClient } from "../pool";
import { findUnlockPayment } from "../unlockPayment";
import { splitterQuerySchema, splitterUnlockSchema } from "../validation";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import {
  SPLITTER_UNLOCK_USDC,
  UNLOCK_TX_NOT_FOUND_ERROR,
  UNLOCK_TX_NOT_PAYMENT_ERROR,
  UNLOCK_TX_REVERTED_ERROR,
  UNLOCK_TX_USED_ERROR,
  UNLOCK_TX_WRONG_SENDER_ERROR,
  isSplitterUnlockRequired,
} from "@/lib/splitterUnlock";

export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 4 * 1024;

function unlocked() {
  return Response.json({ success: true, unlocked: true });
}

/**
 * Claim a payment transaction and unlock the pool's API writes.
 *
 * The caller names the transaction; everything that matters about it is read
 * from the chain: that it succeeded, that it moved at least the price in this
 * chain's USDC to the bot address, and that it was sent, or funded, by the
 * admin claiming it. The transaction's sender covers a wallet broadcasting its
 * own payment; the funds' source covers a contract wallet such as a Safe,
 * where an executor EOA broadcasts and the USDC leaves the signed-in address.
 * Either binding stops a third party watching the chain from racing a payment
 * it did not make onto a pool the payer never meant to unlock.
 *
 * Idempotent for the retry that matters: re-claiming a transaction already
 * recorded for this pool answers unlocked rather than refusing, so a client
 * that lost the first response can safely try again. The same transaction
 * claimed for a different pool is refused, worded apart from every other
 * refusal, because the one actionable fact is that the payment was spent
 * elsewhere.
 */
export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await readJsonBody(request, MAX_BODY_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return errorResponse(err.message, 413);
      }
      return errorResponse("Invalid request body", 400);
    }

    const params = splitterQuerySchema.safeParse(body);
    if (!params.success) {
      return errorResponse(params.error.issues[0].message, 400);
    }

    const parsed = splitterUnlockSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { chainId, poolId } = params.data;
    const { txHash } = parsed.data;

    // The fresh admin read, not the cached one: a claim writes capability that
    // outlives the request. Eligibility runs inside, so an immutable or
    // transferable pool is refused before any money is attached to it.
    const auth = await authorizePoolAdmin(chainId, poolId);
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    if (!isSplitterUnlockRequired(chainId)) {
      return unlocked();
    }

    // A transaction already recorded is answered from the record alone, so
    // the re-claim that lost its response needs no second chain read, and a
    // hash recorded for a different pool is refused before one. A claim
    // naming a new transaction is verified and recorded even when the pool
    // is already unlocked, as when two tabs pay at once, so the table stays
    // a complete account of what reached the bot.
    const recorded = await db
      .selectFrom("splitterUnlockPayments")
      .select("poolId")
      .where("chainId", "=", chainId)
      .where("txHash", "=", txHash)
      .executeTakeFirst();
    if (recorded) {
      return recorded.poolId === poolId
        ? unlocked()
        : errorResponse(UNLOCK_TX_USED_ERROR, 409);
    }

    const token = SPLITTER_UNLOCK_USDC[chainId];
    if (!token) {
      // A gated chain with no payment token is a configuration gap, not a
      // caller fault, and nothing the caller does can clear it.
      console.error(`No unlock token configured for chain ${chainId}`);
      return errorResponse("There was an error, please try again later", 500);
    }

    let receipt;
    try {
      receipt = await getSplitterPublicClient(
        auth.network,
      ).getTransactionReceipt({ hash: txHash });
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) {
        return errorResponse(UNLOCK_TX_NOT_FOUND_ERROR, 400);
      }
      throw err;
    }

    if (receipt.status !== "success") {
      return errorResponse(UNLOCK_TX_REVERTED_ERROR, 400);
    }

    // A claimer who sent the transaction gets credit for everything it moved
    // to the bot, so a payment routed through a splitting contract still
    // counts. A claimer who did not send it only gets credit for funds that
    // left their own wallet, which is the contract-wallet case. When neither
    // yields the price, the refusal names the real fault: wrong wallet only if
    // the transaction genuinely pays the bot, otherwise not a payment.
    const claimerSentTx = receipt.from.toLowerCase() === auth.address;
    const payment = findUnlockPayment(receipt, {
      token,
      receiver: FLOW_STATE_BOT_ADDRESS,
      ...(claimerSentTx ? {} : { payer: auth.address as Address }),
    });
    if (!payment) {
      const paidBySomeoneElse =
        !claimerSentTx &&
        findUnlockPayment(receipt, {
          token,
          receiver: FLOW_STATE_BOT_ADDRESS,
        });
      return paidBySomeoneElse
        ? errorResponse(UNLOCK_TX_WRONG_SENDER_ERROR, 403)
        : errorResponse(UNLOCK_TX_NOT_PAYMENT_ERROR, 400);
    }

    const inserted = await db
      .insertInto("splitterUnlockPayments")
      .values({
        chainId,
        poolId,
        txHash,
        payer: payment.payer.toLowerCase(),
        token: token.toLowerCase(),
        amount: payment.amount.toString(),
      })
      .onConflict((oc) => oc.columns(["chainId", "txHash"]).doNothing())
      .returning("id")
      .executeTakeFirst();

    if (!inserted) {
      const claimed = await db
        .selectFrom("splitterUnlockPayments")
        .select("poolId")
        .where("chainId", "=", chainId)
        .where("txHash", "=", txHash)
        .executeTakeFirst();

      if (claimed?.poolId !== poolId) {
        return errorResponse(UNLOCK_TX_USED_ERROR, 409);
      }
    }

    return unlocked();
  } catch (err) {
    // RPC errors can embed provider URLs, so log server-side only.
    console.error(err);
    return errorResponse("There was an error, please try again later", 502);
  }
}
