import { isAddress } from "viem";
import { db } from "../../db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address || !isAddress(address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid address" }),
      );
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

    return new Response(
      JSON.stringify({ success: true, profile: profile ?? null }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
