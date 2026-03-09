import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { isAdmin, findRoundByCouncil } from "../../auth";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId, councilId, applicationsClosed } = await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        { status: 401 },
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
        { status: 400 },
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
        { status: 400 },
      );
    }

    if (typeof applicationsClosed !== "boolean") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid value" }),
        { status: 400 },
      );
    }

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
        { status: 404 },
      );
    }

    const adminAuthorized = await isAdmin(
      round.id,
      chainId,
      councilId,
      session.address.toLowerCase(),
    );

    if (!adminAuthorized) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
        { status: 403 },
      );
    }

    await db
      .updateTable("rounds")
      .set({ applicationsClosed, updatedAt: new Date() })
      .where("id", "=", round.id)
      .execute();

    return new Response(JSON.stringify({ success: true, applicationsClosed }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to update applications status",
      }),
      { status: 500 },
    );
  }
}
