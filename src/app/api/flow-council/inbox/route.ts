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

    let beforeDate: Date | null = null;
    if (beforeParam !== null) {
      const parsed = new Date(beforeParam);
      if (isNaN(parsed.getTime())) {
        return jsonResponse({ success: false, error: "Invalid before" }, 400);
      }
      beforeDate = parsed;
    }

    let query = db
      .selectFrom("inboxItems")
      .select([
        "id",
        "recipientAddress",
        "messageId",
        "applicationId",
        "category",
        "sourceLabel",
        "snippet",
        "readAt",
        "createdAt",
      ])
      .where("recipientAddress", "=", address)
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (categoryParam) {
      query = query.where("category", "=", categoryParam);
    }
    if (beforeDate) {
      query = query.where("createdAt", "<", beforeDate);
    }

    const items = await query.execute();
    const nextCursor =
      items.length === limit
        ? items[items.length - 1].createdAt.toISOString()
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
