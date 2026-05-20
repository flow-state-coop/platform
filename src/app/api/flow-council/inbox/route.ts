import { getServerSession } from "next-auth/next";
import { sql } from "kysely";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = [
  "application_eligibility",
  "project_channels",
  "round_announcements",
  "internal_review",
  "platform",
] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
    }

    const address = session.address.toLowerCase();

    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category");
    const limitParam = searchParams.get("limit");
    const beforeParam = searchParams.get("before");

    if (
      categoryParam !== null &&
      !ALLOWED_CATEGORIES.includes(
        categoryParam as (typeof ALLOWED_CATEGORIES)[number],
      )
    ) {
      return jsonResponse({ success: false, error: "Invalid category" }, 400);
    }

    let limit = DEFAULT_LIMIT;
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return jsonResponse({ success: false, error: "Invalid limit" }, 400);
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    // Cursor is the row `id`, not `createdAt`. inbox_items is insert-only
    // with an autoincrement id, so id order matches createdAt order while
    // being monotonic and gap-free — a batch of writes sharing one
    // timestamp can't get skipped by a strict `<` on createdAt.
    let beforeId: number | null = null;
    if (beforeParam !== null) {
      const parsed = parseInt(beforeParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return jsonResponse({ success: false, error: "Invalid before" }, 400);
      }
      beforeId = parsed;
    }

    // Join applications → rounds so application-linked items can build a
    // valid deep link (/flow-councils/review/[chainId]/[councilId]). The
    // inbox_items table only carries the application_id FK, not chain/council.
    // Also join projectManagers (scoped to this recipient) so the client can
    // route project managers to the comms channel instead of the admin-only
    // recipient review page.
    let query = db
      .selectFrom("inboxItems")
      .leftJoin("applications", "applications.id", "inboxItems.applicationId")
      .leftJoin("rounds", "rounds.id", "applications.roundId")
      .leftJoin("projectManagers", (join) =>
        join
          .onRef("projectManagers.projectId", "=", "applications.projectId")
          .on("projectManagers.managerAddress", "=", address),
      )
      .select([
        "inboxItems.id",
        "inboxItems.recipientAddress",
        "inboxItems.messageId",
        "inboxItems.applicationId",
        "inboxItems.category",
        "inboxItems.sourceLabel",
        "inboxItems.snippet",
        "inboxItems.readAt",
        "inboxItems.createdAt",
        "rounds.chainId as reviewChainId",
        "rounds.flowCouncilAddress as reviewCouncilId",
        "applications.projectId as reviewProjectId",
        sql<boolean>`project_managers.id IS NOT NULL`.as("isProjectManager"),
      ])
      .where("inboxItems.recipientAddress", "=", address)
      .orderBy("inboxItems.id", "desc")
      .limit(limit);

    if (categoryParam) {
      query = query.where("inboxItems.category", "=", categoryParam);
    }
    if (beforeId) {
      query = query.where("inboxItems.id", "<", beforeId);
    }

    const items = await query.execute();
    const nextCursor =
      items.length === limit
        ? String(items[items.length - 1].id)
        : null;

    const unreadCountRow = await db
      .selectFrom("inboxItems")
      .select(sql<string>`count(*)`.as("count"))
      .where("recipientAddress", "=", address)
      .where("readAt", "is", null)
      .executeTakeFirst();

    const unreadCount = unreadCountRow ? Number(unreadCountRow.count) : 0;

    return jsonResponse({ success: true, items, unreadCount, nextCursor });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
