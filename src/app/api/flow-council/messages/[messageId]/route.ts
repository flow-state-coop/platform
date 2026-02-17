import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { canModerateChannel, isProjectManager } from "../../auth";

export const dynamic = "force-dynamic";

// PATCH - Edit message (author only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    const { content } = await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!messageId || !content?.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters",
        }),
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
      .select(["id", "authorAddress", "channelType", "projectId", "createdAt"])
      .where("id", "=", messageIdNum)
      .executeTakeFirst();

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message not found" }),
      );
    }

    // Only author can edit
    if (message.authorAddress.toLowerCase() !== session.address.toLowerCase()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not authorized to edit this message",
        }),
      );
    }

    const updatedMessage = await db
      .updateTable("messages")
      .set({
        content: content.trim(),
      })
      .where("id", "=", messageIdNum)
      .returning(["id", "authorAddress", "content", "createdAt", "updatedAt"])
      .executeTakeFirstOrThrow();

    if (message.channelType === "PUBLIC_PROJECT" && message.projectId) {
      await db
        .updateTable("messages")
        .set({ content: content.trim() })
        .where("authorAddress", "=", message.authorAddress)
        .where("channelType", "=", "PUBLIC_ROUND")
        .where("projectId", "=", message.projectId)
        .where("createdAt", "=", message.createdAt)
        .execute();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: updatedMessage,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

// DELETE - Delete message (author OR channel moderator)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    const { chainId, councilId } = await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!messageId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing message ID" }),
      );
    }

    const messageIdNum = parseInt(messageId, 10);
    if (isNaN(messageIdNum)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid message ID" }),
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

    const message = await db
      .selectFrom("messages")
      .select([
        "id",
        "authorAddress",
        "channelType",
        "roundId",
        "projectId",
        "messageType",
        "content",
        "createdAt",
      ])
      .where("id", "=", messageIdNum)
      .executeTakeFirst();

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message not found" }),
      );
    }

    const isAuthor =
      message.authorAddress.toLowerCase() === session.address.toLowerCase();

    const isModerator = await canModerateChannel(
      {
        channelType: message.channelType,
        chainId,
        councilId,
        roundId: message.roundId ?? undefined,
        projectId: message.projectId ?? undefined,
      },
      session.address,
    );

    let isManager = false;
    if (
      !isAuthor &&
      !isModerator &&
      message.messageType === "milestone_update" &&
      message.projectId
    ) {
      isManager = await isProjectManager(message.projectId, session.address);
    }

    if (!isAuthor && !isModerator && !isManager) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not authorized to delete this message",
        }),
      );
    }

    await db.deleteFrom("messages").where("id", "=", messageIdNum).execute();

    if (message.messageType === "milestone_update") {
      await db
        .deleteFrom("messages")
        .where("authorAddress", "=", message.authorAddress)
        .where("messageType", "=", "milestone_update")
        .where("content", "=", message.content)
        .where("createdAt", "=", message.createdAt)
        .where("id", "!=", messageIdNum)
        .execute();
    } else if (message.channelType === "PUBLIC_PROJECT" && message.projectId) {
      await db
        .deleteFrom("messages")
        .where("authorAddress", "=", message.authorAddress)
        .where("channelType", "=", "PUBLIC_ROUND")
        .where("projectId", "=", message.projectId)
        .where("createdAt", "=", message.createdAt)
        .execute();
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
