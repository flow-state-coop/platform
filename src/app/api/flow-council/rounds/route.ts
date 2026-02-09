import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const flowCouncilAddress = searchParams.get("flowCouncilAddress");

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
      );
    }

    if (!flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid flow council address",
        }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select([
        "id",
        "chainId",
        "flowCouncilAddress",
        "superappSplitterAddress",
        "details",
      ])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    return new Response(
      JSON.stringify({ success: true, round: round ?? null }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch round" }),
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { chainId, flowCouncilAddress, name, description, logoUrl } =
      await request.json();

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

    if (!name || !description) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing name or description",
        }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .innerJoin("roundAdmins", "rounds.id", "roundAdmins.roundId")
      .select(["rounds.id"])
      .where("rounds.chainId", "=", chainId)
      .where("rounds.flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .where("roundAdmins.adminAddress", "=", session.address.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Round not found or not authorized",
        }),
      );
    }

    const updatedRound = await db
      .updateTable("rounds")
      .set({
        details: JSON.stringify({ name, description, logoUrl }),
        updatedAt: new Date(),
      })
      .where("id", "=", round.id)
      .returning(["id", "chainId", "flowCouncilAddress", "details"])
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify({ success: true, round: updatedRound }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to update round" }),
    );
  }
}
