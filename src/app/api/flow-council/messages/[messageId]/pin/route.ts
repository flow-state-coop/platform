import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../../db";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import {
  canModerateChannel,
  findRoundByCouncil,
  isProjectManager,
} from "../../../auth";
import type { ChannelType } from "@/generated/kysely";

export const dynamic = "force-dynamic";

async function verifyModerator(
  message: {
    channelType: ChannelType;
    roundId: number | null;
    projectId: number | null;
    applicationId: number | null;
  },
  sessionAddress: string,
  chainId: number,
  councilId: string,
): Promise<boolean> {
  if (message.channelType === "PUBLIC_PROJECT" && message.projectId) {
    return isProjectManager(message.projectId, sessionAddress);
  }

  if (!isAddress(councilId)) return false;

  let roundId = message.roundId ?? undefined;
  if (!roundId) {
    const round = await findRoundByCouncil(chainId, councilId);
    roundId = round?.id;
  }

  return canModerateChannel(
    {
      channelType: message.channelType,
      chainId,
      councilId,
      roundId,
      projectId: message.projectId ?? undefined,
      applicationId: message.applicationId ?? undefined,
    },
    sessionAddress,
  );
}

export async function POST(
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

    const messageIdNum = parseInt(messageId, 10);
    if (isNaN(messageIdNum)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid message ID" }),
      );
    }

    const message = await db
      .selectFrom("messages")
      .select([
        "id",
        "channelType",
        "roundId",
        "projectId",
        "applicationId",
        "pinnedAt",
      ])
      .where("id", "=", messageIdNum)
      .executeTakeFirst();

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message not found" }),
      );
    }

    if (message.pinnedAt) {
      return new Response(
        JSON.stringify({ success: false, error: "Message already pinned" }),
      );
    }

    const isPublicProject = message.channelType === "PUBLIC_PROJECT";
    if (!isPublicProject && (!chainId || !councilId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing chainId or councilId",
        }),
      );
    }

    const isModerator = await verifyModerator(
      message,
      session.address,
      chainId,
      councilId,
    );

    if (!isModerator) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    let pinnedQuery = db
      .selectFrom("messages")
      .select(["id", "pinnedAt"])
      .where("channelType", "=", message.channelType)
      .where("pinnedAt", "is not", null)
      .orderBy("pinnedAt", "asc");

    if (message.roundId) {
      pinnedQuery = pinnedQuery.where("roundId", "=", message.roundId);
    } else {
      pinnedQuery = pinnedQuery.where("roundId", "is", null);
    }
    if (message.channelType !== "PUBLIC_ROUND") {
      if (message.projectId) {
        pinnedQuery = pinnedQuery.where("projectId", "=", message.projectId);
      } else {
        pinnedQuery = pinnedQuery.where("projectId", "is", null);
      }
    }
    if (message.applicationId) {
      pinnedQuery = pinnedQuery.where(
        "applicationId",
        "=",
        message.applicationId,
      );
    } else {
      pinnedQuery = pinnedQuery.where("applicationId", "is", null);
    }

    const pinnedMessages = await pinnedQuery.execute();

    let replacedMessageId: number | undefined;
    if (pinnedMessages.length >= 3) {
      const oldest = pinnedMessages[0];
      replacedMessageId = oldest.id;
      await db
        .updateTable("messages")
        .set({ pinnedAt: null, pinnedBy: null })
        .where("id", "=", oldest.id)
        .execute();
    }

    await db
      .updateTable("messages")
      .set({
        pinnedAt: new Date(),
        pinnedBy: session.address.toLowerCase(),
      })
      .where("id", "=", messageIdNum)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        replacedMessageId: replacedMessageId ?? null,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

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

    const isPublicProject = message.channelType === "PUBLIC_PROJECT";
    if (!isPublicProject && (!chainId || !councilId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing chainId or councilId",
        }),
      );
    }

    const isModerator = await verifyModerator(
      message,
      session.address,
      chainId,
      councilId,
    );

    if (!isModerator) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    await db
      .updateTable("messages")
      .set({ pinnedAt: null, pinnedBy: null })
      .where("id", "=", messageIdNum)
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
