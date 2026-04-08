import { isAddress } from "viem";
import { db } from "../../db";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address || !isAddress(address)) {
      return jsonResponse({ success: false, error: "Invalid address" }, 400);
    }

    const profile = await db
      .selectFrom("userProfiles")
      .select([
        "address",
        "displayName",
        "bio",
        "twitter",
        "github",
        "linkedin",
        "farcaster",
      ])
      .where("address", "=", address.toLowerCase())
      .executeTakeFirst();

    return jsonResponse({ success: true, profile: profile ?? null });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
