import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { ChannelType } from "@/generated/kysely";
import {
  sendChatMessageEmail,
  sendAnnouncementEmail,
  sendInternalCommentEmail,
  getProjectAndRoundDetails,
  getRoundDetails,
  getChatMessageRecipients,
  getAnnouncementRecipients,
  getRoundAdminEmailsExcludingAddress,
} from "../email";
import {
  type AuthorAffiliation,
  type ChannelContext,
  findRoundByCouncil,
  canReadChannel,
  canWriteChannel,
} from "../auth";
import { getAuthorAffiliations } from "../affiliations";
import { parseDetails, type ProjectMetadata } from "../utils";
import type { ProjectDetails } from "@/types/project";

export const dynamic = "force-dynamic";

// GET - Fetch messages for a channel
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelType = searchParams.get("channelType") as ChannelType | null;
    const applicationId = searchParams.get("applicationId");
    const chainId = searchParams.get("chainId");
    const councilId = searchParams.get("councilId");
    const roundId = searchParams.get("roundId");
    const projectId = searchParams.get("projectId");

    const effectiveChannelType =
      channelType || (applicationId ? "INTERNAL_APPLICATION" : null);

    if (!effectiveChannelType) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing channelType" }),
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

    const chainIdNum = parseInt(chainId, 10);
    if (isNaN(chainIdNum)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid chain ID" }),
      );
    }

    if (!isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    // Get session (may be null for public channels)
    const session = await getServerSession(authOptions);

    const round = await findRoundByCouncil(chainIdNum, councilId);

    const roundIdNum = roundId ? parseInt(roundId, 10) : round?.id;

    const ctx: ChannelContext = {
      channelType: effectiveChannelType,
      chainId: chainIdNum,
      councilId,
      roundId: roundIdNum,
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      applicationId: applicationId ? parseInt(applicationId, 10) : undefined,
    };

    const canRead = await canReadChannel(ctx, session?.address || null);

    if (!canRead) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    let query = db
      .selectFrom("messages")
      .select([
        "id",
        "authorAddress",
        "content",
        "messageType",
        "projectId",
        "createdAt",
        "updatedAt",
      ])
      .where("channelType", "=", effectiveChannelType)
      .orderBy("createdAt", "asc");

    // Add appropriate filters
    if (effectiveChannelType === "INTERNAL_APPLICATION" && applicationId) {
      query = query.where("applicationId", "=", parseInt(applicationId, 10));
    } else if (
      effectiveChannelType === "GROUP_PROJECT" ||
      effectiveChannelType === "PUBLIC_PROJECT"
    ) {
      if (projectId) {
        query = query.where("projectId", "=", parseInt(projectId, 10));
      }
    } else if (roundIdNum) {
      query = query.where("roundId", "=", roundIdNum);
    }

    const messages = await query.execute();

    // Fetch affiliations for all message authors
    let affiliations: Record<string, AuthorAffiliation> = {};
    if (roundIdNum && messages.length > 0) {
      const authorAddresses = messages.map((m) => m.authorAddress);
      affiliations = await getAuthorAffiliations(
        authorAddresses,
        roundIdNum,
        chainIdNum,
        councilId,
      );
    }

    const projectMetadata: Record<number, ProjectMetadata> = {};
    const projectIds = [
      ...new Set(
        messages
          .map((m) => m.projectId)
          .filter((id): id is number => id !== null),
      ),
    ];
    if (projectIds.length > 0) {
      const projects = await db
        .selectFrom("projects")
        .select(["id", "details"])
        .where("id", "in", projectIds)
        .execute();

      for (const p of projects) {
        const details = parseDetails<ProjectDetails>(p.details);
        if (details?.name) {
          projectMetadata[p.id] = {
            name: details.name,
            logoUrl: details.logoUrl ?? null,
          };
        }
      }
    }

    let managedProjectIds: number[] = [];
    if (session?.address) {
      const managed = await db
        .selectFrom("projectManagers")
        .select("projectId")
        .where("managerAddress", "=", session.address.toLowerCase())
        .execute();
      managedProjectIds = managed.map((m) => m.projectId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messages,
        affiliations,
        projectMetadata,
        managedProjectIds,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

// POST - Create a new message
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      channelType: rawChannelType,
      applicationId,
      chainId,
      councilId,
      roundId,
      projectId,
      content,
      sendEmail,
    } = body;

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    // For backwards compatibility
    const channelType: ChannelType =
      rawChannelType || (applicationId ? "INTERNAL_APPLICATION" : null);

    if (!channelType || !content?.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters",
        }),
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

    const round = await findRoundByCouncil(chainId, councilId);

    const effectiveRoundId = roundId || round?.id;

    const ctx: ChannelContext = {
      channelType,
      chainId,
      councilId,
      roundId: effectiveRoundId,
      projectId,
      applicationId,
    };

    const canWrite = await canWriteChannel(ctx, session.address);

    if (!canWrite) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    // Get project ID for INTERNAL_APPLICATION if needed
    let messageProjectId = projectId;
    if (
      channelType === "INTERNAL_APPLICATION" &&
      applicationId &&
      !messageProjectId
    ) {
      const application = await db
        .selectFrom("applications")
        .select(["roundId", "projectId"])
        .where("id", "=", applicationId)
        .executeTakeFirst();

      if (!application) {
        return new Response(
          JSON.stringify({ success: false, error: "Application not found" }),
        );
      }
      messageProjectId = application.projectId;
    }

    // Create the message
    const message = await db
      .insertInto("messages")
      .values({
        channelType,
        roundId: effectiveRoundId || null,
        projectId: messageProjectId || null,
        applicationId: applicationId || null,
        authorAddress: session.address.toLowerCase(),
        content: content.trim(),
      })
      .returning(["id", "authorAddress", "content", "createdAt", "updatedAt"])
      .executeTakeFirstOrThrow();

    if (channelType === "PUBLIC_PROJECT" && messageProjectId) {
      const activeRounds = await db
        .selectFrom("applications")
        .select("roundId")
        .where("projectId", "=", messageProjectId)
        .where("status", "=", "ACCEPTED")
        .execute();

      if (activeRounds.length > 0) {
        await db
          .insertInto("messages")
          .values(
            activeRounds.map((r) => ({
              channelType: "PUBLIC_ROUND" as const,
              roundId: r.roundId,
              projectId: messageProjectId,
              applicationId: null,
              authorAddress: session.address.toLowerCase(),
              content: content.trim(),
              createdAt: message.createdAt,
            })),
          )
          .execute();
      }
    }

    // Send email notification if requested (non-blocking)
    if (sendEmail === true && effectiveRoundId) {
      const baseUrl = new URL(request.url).origin;
      const messageContent = content.trim();
      if (channelType === "GROUP_ANNOUNCEMENTS") {
        Promise.all([
          getRoundDetails(effectiveRoundId),
          getAnnouncementRecipients(effectiveRoundId, session.address),
        ])
          .then(([details, recipients]) => {
            if (details) {
              return sendAnnouncementEmail(recipients, {
                baseUrl,
                roundName: details.roundName,
                sender: session.address,
                messageContent,
                chainId: details.chainId,
                councilId: details.councilId,
              });
            }
          })
          .catch((err) =>
            console.error("Failed to send announcement email:", err),
          );
      } else if (channelType === "INTERNAL_APPLICATION" && applicationId) {
        Promise.all([
          getProjectAndRoundDetails(messageProjectId!, effectiveRoundId),
          getRoundAdminEmailsExcludingAddress(
            effectiveRoundId,
            session.address,
          ),
        ])
          .then(([details, recipients]) => {
            if (details) {
              return sendInternalCommentEmail(recipients, {
                baseUrl,
                projectName: details.projectName,
                roundName: details.roundName,
                sender: session.address,
                messageContent,
                chainId: details.chainId,
                councilId: details.councilId,
                applicationId,
              });
            }
          })
          .catch((err) =>
            console.error("Failed to send internal comment email:", err),
          );
      } else if (messageProjectId) {
        Promise.all([
          getProjectAndRoundDetails(messageProjectId, effectiveRoundId),
          getChatMessageRecipients(
            messageProjectId,
            effectiveRoundId,
            session.address,
          ),
        ])
          .then(([details, recipients]) => {
            if (details) {
              return sendChatMessageEmail(recipients, {
                baseUrl,
                projectName: details.projectName,
                roundName: details.roundName,
                sender: session.address,
                messageContent,
                chainId: details.chainId,
                councilId: details.councilId,
                projectId: messageProjectId,
              });
            }
          })
          .catch((err) =>
            console.error("Failed to send chat message email:", err),
          );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
