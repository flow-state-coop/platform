import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId, flowCouncilAddress, admins } = await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
      );
    }

    if (!isAddress(flowCouncilAddress)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid flow council address",
        }),
      );
    }

    if (!Array.isArray(admins) || !admins.every((a) => isAddress(a))) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid admins array" }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select(["id"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const isRoundAdmin = await db
      .selectFrom("roundAdmins")
      .select("id")
      .where("roundId", "=", round.id)
      .where("adminAddress", "=", session.address.toLowerCase())
      .executeTakeFirst();

    if (!isRoundAdmin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not an admin of this council",
        }),
      );
    }

    // Add new admins (ignore duplicates)
    if (admins.length > 0) {
      await db
        .insertInto("roundAdmins")
        .values(
          admins.map((admin: string) => ({
            roundId: round.id,
            adminAddress: admin.toLowerCase(),
          })),
        )
        .onConflict((oc) => oc.columns(["roundId", "adminAddress"]).doNothing())
        .execute();
    }

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Failed to sync admins",
      }),
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { chainId, flowCouncilAddress, admins } = await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
      );
    }

    if (!isAddress(flowCouncilAddress)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid flow council address",
        }),
      );
    }

    if (!Array.isArray(admins) || !admins.every((a) => isAddress(a))) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid admins array" }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select(["id"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const isRoundAdmin = await db
      .selectFrom("roundAdmins")
      .select("id")
      .where("roundId", "=", round.id)
      .where("adminAddress", "=", session.address.toLowerCase())
      .executeTakeFirst();

    if (!isRoundAdmin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not an admin of this council",
        }),
      );
    }

    // Remove admins from database
    if (admins.length > 0) {
      await db
        .deleteFrom("roundAdmins")
        .where("roundId", "=", round.id)
        .where(
          "adminAddress",
          "in",
          admins.map((a: string) => a.toLowerCase()),
        )
        .execute();
    }

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Failed to remove admins",
      }),
    );
  }
}
