import { db } from "./db";

// Profile names are not council-specific; re-exported so council callers keep
// one import site while flow-splitter shares the same lookup.
export { fetchDisplayNames } from "../enrichment";

type ReactionSummary = {
  emoji: string;
  count: number;
  hasReacted: boolean;
};

export async function fetchReactions(
  messageIds: number[],
  currentAddress?: string,
): Promise<Record<number, ReactionSummary[]>> {
  const reactions: Record<number, ReactionSummary[]> = {};

  if (messageIds.length === 0) return reactions;

  const allReactions = await db
    .selectFrom("messageReactions")
    .select(["messageId", "emoji", "authorAddress"])
    .where("messageId", "in", messageIds)
    .execute();

  const normalizedAddress = currentAddress?.toLowerCase();

  for (const r of allReactions) {
    if (!reactions[r.messageId]) {
      reactions[r.messageId] = [];
    }

    const existing = reactions[r.messageId].find((s) => s.emoji === r.emoji);
    if (existing) {
      existing.count++;
      if (normalizedAddress && r.authorAddress === normalizedAddress) {
        existing.hasReacted = true;
      }
    } else {
      reactions[r.messageId].push({
        emoji: r.emoji,
        count: 1,
        hasReacted:
          !!normalizedAddress && r.authorAddress === normalizedAddress,
      });
    }
  }

  return reactions;
}
