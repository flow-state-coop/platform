import { db } from "../db";
import { isSplitterUnlockRequired } from "@/lib/splitterUnlock";

/**
 * Whether writes are paid for on this pool. One indexed lookup, checked on
 * every write acceptance; unlocking is one-way, so a job already accepted
 * never needs to re-check.
 */
export async function isPoolUnlocked(
  chainId: number,
  poolId: string,
): Promise<boolean> {
  if (!isSplitterUnlockRequired(chainId)) {
    return true;
  }

  const payment = await db
    .selectFrom("splitterUnlockPayments")
    .select("id")
    .where("chainId", "=", chainId)
    .where("poolId", "=", poolId)
    .limit(1)
    .executeTakeFirst();

  return !!payment;
}
