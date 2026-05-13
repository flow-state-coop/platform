import { getServerSession } from "next-auth/next";
import { db } from "../../../db";
import { authOptions } from "../../../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
    }

    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) {
      return jsonResponse({ success: false, error: "Invalid id" }, 400);
    }

    const address = session.address.toLowerCase();

    await db
      .updateTable("inboxItems")
      .set({ readAt: new Date() })
      .where("id", "=", itemId)
      .where("recipientAddress", "=", address)
      .where("readAt", "is", null)
      .execute();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
