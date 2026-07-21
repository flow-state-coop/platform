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
 * Every "nft"-eligibility group on a council, lowest id first. Unlike
 * getGroupByMethod a council can have several of these (a tiered membership),
 * and the ordering is the documented tie-break when a wallet qualifies for more
 * than one at the same allocation.
 */
export function loadNftRequirements(roundId: number) {
  return db
    .selectFrom("voterGroups")
    .select([
      "id",
      "name",
      "defaultVotingPower",
      "nftContractAddress",
      "nftTokenStandard",
      "nftTokenId",
      "nftAcquisitionUrl",
    ])
    .where("roundId", "=", roundId)
    .where("eligibilityMethod", "=", "nft")
    .orderBy("id", "asc")
    .execute();
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
  // Deliberately no viem nonceManager. It consumes a nonce before the send and
  // never gives it back on failure, so one rejected broadcast leaves every
  // later transaction from this key sitting in a nonce gap. Its cache is also a
  // module-level singleton keyed by address, so a wedge caused by a claim would
  // silently stop metrics ballots and GoodDollar claims too. viem re-reads the
  // pending nonce per send instead, which self-heals; concurrent sends are kept
  // apart by the per-council rate windows.
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

const signerCache = new Map<number, ReturnType<typeof buildBotSigner>>();

/**
 * The bot signer for a network, memoized per chain. The memo is what makes the
 * account's nonce manager useful: a signer rebuilt per request would start from
 * a fresh nonce state every time.
 */
export function getBotSigner(network: Network) {
  const cached = signerCache.get(network.id);
  if (cached) return cached;

  const signer = buildBotSigner(network);
  signerCache.set(network.id, signer);
  return signer;
}
