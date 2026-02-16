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
  hasOnChainRole,
  findRoundByCouncil,
  canReadChannel,
  canWriteChannel,
} from "../auth";

export const dynamic = "force-dynamic";

async function getAuthorAffiliations(
  addresses: string[],
  roundId: number,
  chainId: number,
  councilId: string,
): Promise<Record<string, AuthorAffiliation>> {
  if (addresses.length === 0) {
    return {};
  }

  const normalizedAddresses = addresses.map((a) => a.toLowerCase());
  const uniqueAddresses = [...new Set(normalizedAddresses)];

  // Batch query round admins
  const dbAdmins = await db
    .selectFrom("roundAdmins")
    .select("adminAddress")
    .where("roundId", "=", roundId)
    .where("adminAddress", "in", uniqueAddresses)
    .execute();

  const dbAdminSet = new Set(dbAdmins.map((a) => a.adminAddress.toLowerCase()));

  // Batch query project managers with applications in this round and project details
  const projectManagersData = await db
    .selectFrom("projectManagers")
    .innerJoin(
      "applications",
      "projectManagers.projectId",
      "applications.projectId",
    )
    .innerJoin("projects", "projectManagers.projectId", "projects.id")
    .select(["projectManagers.managerAddress", "projects.details"])
    .where("applications.roundId", "=", roundId)
    .where("projectManagers.managerAddress", "in", uniqueAddresses)
    .execute();

  // Map manager addresses to their project names (parsed from JSON details)
  const projectManagerMap = new Map<string, string>();
  for (const pm of projectManagersData) {
    const addr = pm.managerAddress.toLowerCase();
    // First project found wins (in case manager has multiple projects)
    if (!projectManagerMap.has(addr)) {
      const projectDetails =
        typeof pm.details === "string" ? JSON.parse(pm.details) : pm.details;
      const projectName = projectDetails?.name;
      if (projectName) {
        projectManagerMap.set(addr, projectName);
      }
    }
  }

  // Check on-chain roles for addresses that are not DB admins
  const addressesNeedingOnChainCheck = uniqueAddresses.filter(
    (addr) => !dbAdminSet.has(addr),
  );

  const onChainAdminSet = new Set<string>();
  if (addressesNeedingOnChainCheck.length > 0) {
    const onChainResults = await Promise.all(
      addressesNeedingOnChainCheck.map(async (addr) => {
        const hasRole = await hasOnChainRole(chainId, councilId, addr);
        return { addr, hasRole };
      }),
    );

    for (const { addr, hasRole } of onChainResults) {
      if (hasRole) {
        onChainAdminSet.add(addr);
      }
    }
  }

  // Build the result map
  const result: Record<string, AuthorAffiliation> = {};
  for (const addr of uniqueAddresses) {
    const isAdmin = dbAdminSet.has(addr) || onChainAdminSet.has(addr);
    const projectName = projectManagerMap.get(addr) || null;

    // Only include if there's something to show
    if (isAdmin || projectName) {
      result[addr] = { isAdmin, projectName };
    }
  }

  return result;
}

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

    // For backwards compatibility, default to INTERNAL_APPLICATION if applicationId is provided
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

    let projectLogos: Record<number, string | null> = {};
    const milestoneMessages = messages.filter(
      (m) => m.messageType === "milestone_update" && m.projectId,
    );
    if (milestoneMessages.length > 0) {
      const projectIds = [
        ...new Set(milestoneMessages.map((m) => m.projectId!)),
      ];
      const projects = await db
        .selectFrom("projects")
        .select(["id", "details"])
        .where("id", "in", projectIds)
        .execute();

      projectLogos = Object.fromEntries(
        projects.map((p) => {
          const details =
            typeof p.details === "string" ? JSON.parse(p.details) : p.details;
          return [p.id, (details as { logoUrl?: string })?.logoUrl ?? null];
        }),
      );
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
        projectLogos,
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
