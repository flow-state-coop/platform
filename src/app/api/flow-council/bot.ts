import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { db } from "./db";
import { getViemChain } from "@/lib/networks";
import type { Network } from "@/types/network";

/**
 * Resolve the single voter group on a council that uses a given automated
 * eligibility method ("gooddollar" or "metrics"), if one exists. Queried
 * directly with no in-memory cache: it is a single indexed read on a small
 * table, and a process-local TTL cache would go stale for up to a minute after
 * an admin changed a group's eligibility method or default allocation (and
 * wouldn't be shared across serverless instances regardless).
 */
export function getGroupByMethod(roundId: number, method: string) {
  return db
    .selectFrom("voterGroups")
    .select(["id", "defaultVotingPower", "lastBallotAt"])
    .where("roundId", "=", roundId)
    .where("eligibilityMethod", "=", method)
    .orderBy("id", "asc")
    .executeTakeFirst();
}

/**
 * Build the viem account + clients that sign on-chain actions as the Flow State
 * bot. Single seam for the wallet model: today one centralized key signs for
 * every council; a future per-council HD wallet would be derived here from the
 * network/round instead. Callers on a hot path memoize the result per chain.
 */
export function buildBotSigner(network: Network) {
  const pk = process.env.FLOW_STATE_ELIGIBILITY_PK;
  if (!pk) {
    throw new Error("FLOW_STATE_ELIGIBILITY_PK is not configured");
  }
  const account = privateKeyToAccount(pk as `0x${string}`);
  const viemChain = getViemChain(network.id);
  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(network.rpcUrl),
  });
  const walletClient = createWalletClient({
    chain: viemChain,
    transport: http(network.rpcUrl),
  });
  return { account, publicClient, walletClient };
}
