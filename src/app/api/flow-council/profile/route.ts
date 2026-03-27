import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { validateDisplayName } from "../validation";

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
      .select(["address", "displayName"])
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

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const body = await request.json();
    const validation = validateDisplayName(body.displayName);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
      );
    }

    const profile = await db
      .insertInto("userProfiles")
      .values({
        address: session.address.toLowerCase(),
        displayName: validation.data,
      })
      .onConflict((oc) =>
        oc.column("address").doUpdateSet({
          displayName: validation.data,
          updatedAt: new Date(),
        }),
      )
      .returning(["address", "displayName"])
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify({ success: true, profile }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    await db
      .deleteFrom("userProfiles")
      .where("address", "=", session.address.toLowerCase())
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
