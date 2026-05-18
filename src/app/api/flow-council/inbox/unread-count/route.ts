import { getServerSession } from "next-auth/next";
import { sql } from "kysely";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
    }

    const address = session.address.toLowerCase();

    const row = await db
      .selectFrom("inboxItems")
      .select(sql<string>`count(*)`.as("count"))
      .where("recipientAddress", "=", address)
      .where("readAt", "is", null)
      .executeTakeFirst();

    const unreadCount = row ? Number(row.count) : 0;

    return jsonResponse({ success: true, unreadCount });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
