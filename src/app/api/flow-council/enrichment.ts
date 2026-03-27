import { db } from "./db";

export async function fetchDisplayNames(
  authorAddresses: string[],
): Promise<Record<string, string>> {
  const displayNames: Record<string, string> = {};
  const uniqueAddresses = [
    ...new Set(authorAddresses.map((a) => a.toLowerCase())),
  ];

  if (uniqueAddresses.length === 0) return displayNames;

  const profiles = await db
    .selectFrom("userProfiles")
    .select(["address", "displayName"])
    .where("address", "in", uniqueAddresses)
    .execute();

  for (const p of profiles) {
    displayNames[p.address] = p.displayName;
  }

  return displayNames;
}

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
