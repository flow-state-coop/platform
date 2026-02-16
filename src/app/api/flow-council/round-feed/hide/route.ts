import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { findRoundByCouncil, isRoundAdmin, hasOnChainRole } from "../../auth";

export const dynamic = "force-dynamic";

async function checkRoundAdmin(
  chainId: number,
  councilId: string,
  address: string,
): Promise<{ authorized: boolean; roundId?: number }> {
  const round = await findRoundByCouncil(chainId, councilId);
  if (!round) {
    return { authorized: false };
  }

  const [isDbAdmin, isOnChain] = await Promise.all([
    isRoundAdmin(round.id, address),
    hasOnChainRole(chainId, councilId, address),
  ]);

  return { authorized: isDbAdmin || isOnChain, roundId: round.id };
}

export async function POST(request: Request) {
  try {
    const { messageId, chainId, councilId } = await request.json();

    const session = await getServerSession(authOptions);
    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!messageId || !chainId || !councilId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters",
        }),
      );
    }

    if (!isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const { authorized, roundId } = await checkRoundAdmin(
      chainId,
      councilId,
      session.address,
    );

    if (!authorized || !roundId) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    await db
      .deleteFrom("roundFeedReposts")
      .where("messageId", "=", messageId)
      .where("roundId", "=", roundId)
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { messageId, chainId, councilId } = await request.json();

    const session = await getServerSession(authOptions);
    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!messageId || !chainId || !councilId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters",
        }),
      );
    }

    if (!isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const { authorized, roundId } = await checkRoundAdmin(
      chainId,
      councilId,
      session.address,
    );

    if (!authorized || !roundId) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    await db
      .insertInto("roundFeedReposts")
      .values({ messageId, roundId })
      .onConflict((oc) => oc.columns(["messageId", "roundId"]).doNothing())
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
