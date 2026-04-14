import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../../db";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { canReadChannel, findRoundByCouncil } from "../../../auth";
import { validateReactionEmoji } from "../../../validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    const { emoji, chainId, councilId, authorAddress } = await request.json();

    const validation = validateReactionEmoji(emoji);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
      );
    }

    const messageIdNum = parseInt(messageId, 10);
    if (isNaN(messageIdNum)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid message ID" }),
      );
    }

    const message = await db
      .selectFrom("messages")
      .select(["id", "channelType", "roundId", "projectId", "applicationId"])
      .where("id", "=", messageIdNum)
      .executeTakeFirst();

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message not found" }),
      );
    }

    const isPublicChannel =
      message.channelType === "PUBLIC_PROJECT" ||
      message.channelType === "PUBLIC_ROUND";

    let address: string;

    if (isPublicChannel) {
      if (!authorAddress || !isAddress(authorAddress)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid author address" }),
        );
      }
      address = authorAddress;
    } else {
      const session = await getServerSession(authOptions);

      if (!session?.address) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthenticated" }),
        );
      }

      if (!chainId || !councilId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing chainId or councilId",
          }),
        );
      }

      if (!isAddress(councilId)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid council ID" }),
        );
      }

      let roundId = message.roundId ?? undefined;
      if (!roundId) {
        const round = await findRoundByCouncil(chainId, councilId);
        roundId = round?.id;
      }

      const canRead = await canReadChannel(
        {
          channelType: message.channelType,
          chainId,
          councilId,
          roundId,
          projectId: message.projectId ?? undefined,
          applicationId: message.applicationId ?? undefined,
        },
        session.address,
      );

      if (!canRead) {
        return new Response(
          JSON.stringify({ success: false, error: "Not authorized" }),
        );
      }

      address = session.address;
    }

    const existing = await db
      .selectFrom("messageReactions")
      .select("id")
      .where("messageId", "=", messageIdNum)
      .where("authorAddress", "=", address.toLowerCase())
      .where("emoji", "=", validation.data)
      .executeTakeFirst();

    if (existing) {
      await db
        .deleteFrom("messageReactions")
        .where("id", "=", existing.id)
        .execute();

      return new Response(JSON.stringify({ success: true, action: "removed" }));
    }

    await db
      .insertInto("messageReactions")
      .values({
        messageId: messageIdNum,
        authorAddress: address.toLowerCase(),
        emoji: validation.data,
      })
      .execute();

    return new Response(JSON.stringify({ success: true, action: "added" }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
