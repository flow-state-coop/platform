import { db } from "@/app/api/flow-council/db";
import type { NotificationCategory } from "./consent";

export type InboxItemInput = {
  recipientAddress: string;
  category: NotificationCategory;
  sourceLabel?: string | null;
  snippet?: string | null;
  messageId?: number | null;
  applicationId?: number | null;
};

export type WriteInboxItemsOptions = {
  // By default failures are logged and swallowed (best-effort, fire-and-forget).
  // Set this when the caller awaits the result and reports success/failure to
  // the user, so a failed insert isn't silently masked.
  throwOnError?: boolean;
};

// Insert in fixed-size chunks rather than one giant multi-row INSERT: a
// platform-wide blast resolves one inbox row per profile, which at tens of
// thousands of users could trip statement-size limits or time out. Mirrors
// the CHUNK_SIZE batching in sendPersonalizedBatch so both paths scale alike.
const CHUNK_SIZE = 500;

export async function writeInboxItems(
  items: InboxItemInput[],
  options?: WriteInboxItemsOptions,
): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((i) => ({
    recipientAddress: i.recipientAddress.toLowerCase(),
    category: i.category,
    sourceLabel: i.sourceLabel ?? null,
    snippet: i.snippet ? i.snippet.slice(0, 500) : null,
    messageId: i.messageId ?? null,
    applicationId: i.applicationId ?? null,
  }));
  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await db
        .insertInto("inboxItems")
        .values(rows.slice(i, i + CHUNK_SIZE))
        .execute();
    }
  } catch (error) {
    console.error("Failed to write inbox items:", error);
    if (options?.throwOnError) throw error;
  }
}
