import { db } from "./db";

// Re-exported so council routes keep a single import site for the bot wallet
// while the signer itself is shared with non-council APIs (flow-splitter).
export { buildBotSigner, getBotSigner, sendBotTransaction } from "../bot";

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
    ])
    .where("roundId", "=", roundId)
    .where("eligibilityMethod", "=", "nft")
    .orderBy("id", "asc")
    .execute();
}
