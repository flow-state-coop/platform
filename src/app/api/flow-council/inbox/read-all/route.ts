import { getServerSession } from "next-auth/next";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
    }

    const address = session.address.toLowerCase();

    const result = await db
      .updateTable("inboxItems")
      .set({ readAt: new Date() })
      .where("recipientAddress", "=", address)
      .where("readAt", "is", null)
      .executeTakeFirst();

    const updatedCount = Number(result.numUpdatedRows ?? 0);

    return jsonResponse({ success: true, updatedCount });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
