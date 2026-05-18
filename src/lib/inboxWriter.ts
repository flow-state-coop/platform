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

export async function writeInboxItems(
  items: InboxItemInput[],
  options?: WriteInboxItemsOptions,
): Promise<void> {
  if (items.length === 0) return;
  try {
    await db
      .insertInto("inboxItems")
      .values(
        items.map((i) => ({
          recipientAddress: i.recipientAddress.toLowerCase(),
          category: i.category,
          sourceLabel: i.sourceLabel ?? null,
          snippet: i.snippet ? i.snippet.slice(0, 500) : null,
          messageId: i.messageId ?? null,
          applicationId: i.applicationId ?? null,
        })),
      )
      .execute();
  } catch (error) {
    console.error("Failed to write inbox items:", error);
    if (options?.throwOnError) throw error;
  }
}
