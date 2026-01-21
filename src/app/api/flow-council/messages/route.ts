import { getServerSession } from "next-auth/next";
import {
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  parseAbi,
  Address,
  Chain,
  isAddress,
} from "viem";
import { optimism, arbitrum, base, optimismSepolia } from "wagmi/chains";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { ChannelType } from "@/generated/kysely";
import {
  sendChatMessageEmail,
  sendAnnouncementEmail,
  getProjectAndRoundDetails,
  getRoundDetails,
  ADMIN_NOTIFICATION_EMAILS,
} from "../email";

export const dynamic = "force-dynamic";

const chains: { [id: number]: Chain } = {
  10: optimism,
  42161: arbitrum,
  8453: base,
  11155420: optimismSepolia,
};

const RECIPIENT_MANAGER_ROLE = keccak256(
  encodePacked(["string"], ["RECIPIENT_MANAGER_ROLE"]),
);

const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const VOTER_MANAGER_ROLE = keccak256(
  encodePacked(["string"], ["VOTER_MANAGER_ROLE"]),
);

async function hasOnChainRole(
  chainId: number,
  councilId: string,
  address: string,
): Promise<boolean> {
  const network = networks.find((n) => n.id === chainId);
  if (!network) return false;

  const publicClient = createPublicClient({
    chain: chains[chainId],
    transport: http(network.rpcUrl),
  });

  try {
    const [hasRecipientManagerRole, hasVoterManagerRole, hasDefaultAdminRole] =
      await Promise.all([
        publicClient.readContract({
          address: councilId as Address,
          abi: parseAbi([
            "function hasRole(bytes32 role, address account) view returns (bool)",
          ]),
          functionName: "hasRole",
          args: [RECIPIENT_MANAGER_ROLE, address as Address],
        }),
        publicClient.readContract({
          address: councilId as Address,
          abi: parseAbi([
            "function hasRole(bytes32 role, address account) view returns (bool)",
          ]),
          functionName: "hasRole",
          args: [VOTER_MANAGER_ROLE, address as Address],
        }),
        publicClient.readContract({
          address: councilId as Address,
          abi: parseAbi([
            "function hasRole(bytes32 role, address account) view returns (bool)",
          ]),
          functionName: "hasRole",
          args: [DEFAULT_ADMIN_ROLE as `0x${string}`, address as Address],
        }),
      ]);

    return (
      hasRecipientManagerRole || hasVoterManagerRole || hasDefaultAdminRole
    );
  } catch (err) {
    console.error("Error checking roles:", err);
    return false;
  }
}

async function isRoundAdmin(
  roundId: number,
  address: string,
): Promise<boolean> {
  const admin = await db
    .selectFrom("roundAdmins")
    .select("id")
    .where("roundId", "=", roundId)
    .where("adminAddress", "=", address.toLowerCase())
    .executeTakeFirst();

  return !!admin;
}

async function isProjectManager(
  projectId: number,
  address: string,
): Promise<boolean> {
  const manager = await db
    .selectFrom("projectManagers")
    .select("id")
    .where("projectId", "=", projectId)
    .where("managerAddress", "=", address.toLowerCase())
    .executeTakeFirst();

  return !!manager;
}

async function isAcceptedGrantee(
  roundId: number,
  address: string,
): Promise<boolean> {
  // Check if user is a manager of any project with an accepted application in this round
  const result = await db
    .selectFrom("applications")
    .innerJoin(
      "projectManagers",
      "applications.projectId",
      "projectManagers.projectId",
    )
    .select("applications.id")
    .where("applications.roundId", "=", roundId)
    .where("applications.status", "=", "ACCEPTED")
    .where("projectManagers.managerAddress", "=", address.toLowerCase())
    .executeTakeFirst();

  return !!result;
}

type ChannelContext = {
  channelType: ChannelType;
  chainId: number;
  councilId: string;
  roundId?: number;
  projectId?: number;
  applicationId?: number;
};

async function canReadChannel(
  ctx: ChannelContext,
  address: string | null,
): Promise<boolean> {
  const { channelType, chainId, councilId, roundId, projectId } = ctx;

  // Public channels - anyone can read
  if (channelType === "PUBLIC_ROUND" || channelType === "PUBLIC_PROJECT") {
    return true;
  }

  // All other channels require authentication
  if (!address) return false;

  switch (channelType) {
    case "INTERNAL_APPLICATION":
      return hasOnChainRole(chainId, councilId, address);

    case "GROUP_ANNOUNCEMENTS": {
      if (!roundId) return false;
      // Read: Accepted grantee manager addresses OR Round admins (db or on-chain)
      const [isGrantee, isDbAdmin, isOnChainAdmin] = await Promise.all([
        isAcceptedGrantee(roundId, address),
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isGrantee || isDbAdmin || isOnChainAdmin;
    }

    case "GROUP_PROJECT": {
      if (!projectId || !roundId) return false;
      // Read: Project managers OR Round admins (db or on-chain)
      const [isProjManager, isDbAdmin, isOnChainAdmin] = await Promise.all([
        isProjectManager(projectId, address),
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isProjManager || isDbAdmin || isOnChainAdmin;
    }

    case "GROUP_APPLICANTS":
    case "GROUP_GRANTEES":
    case "GROUP_ROUND_ADMINS": {
      if (!roundId) return false;
      const [isDbAdmin, isOnChainAdmin] = await Promise.all([
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isDbAdmin || isOnChainAdmin;
    }

    default:
      return false;
  }
}

async function canWriteChannel(
  ctx: ChannelContext,
  address: string,
): Promise<boolean> {
  const { channelType, chainId, councilId, roundId, projectId } = ctx;

  switch (channelType) {
    case "INTERNAL_APPLICATION":
      return hasOnChainRole(chainId, councilId, address);

    case "GROUP_ANNOUNCEMENTS": {
      // Write: Round admins only (db or on-chain)
      if (!roundId) return false;
      const [isDbAdmin, isOnChainAdmin] = await Promise.all([
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isDbAdmin || isOnChainAdmin;
    }

    case "GROUP_PROJECT": {
      if (!projectId || !roundId) return false;
      // Write: Project managers OR Round admins (db or on-chain)
      const [isProjManager, isDbAdmin, isOnChainAdmin] = await Promise.all([
        isProjectManager(projectId, address),
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isProjManager || isDbAdmin || isOnChainAdmin;
    }

    case "PUBLIC_ROUND": {
      // Write: Round admins only (db or on-chain)
      if (!roundId) return false;
      const [isDbAdmin, isOnChainAdmin] = await Promise.all([
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isDbAdmin || isOnChainAdmin;
    }

    case "PUBLIC_PROJECT":
      // Write: Project managers
      if (!projectId) return false;
      return isProjectManager(projectId, address);

    case "GROUP_APPLICANTS":
    case "GROUP_GRANTEES":
    case "GROUP_ROUND_ADMINS": {
      if (!roundId) return false;
      const [isDbAdmin, isOnChainAdmin] = await Promise.all([
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isDbAdmin || isOnChainAdmin;
    }

    default:
      return false;
  }
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

    // Get round from database
    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainIdNum)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    const roundIdNum = roundId ? parseInt(roundId, 10) : round?.id;

    const ctx: ChannelContext = {
      channelType: effectiveChannelType,
      chainId: chainIdNum,
      councilId,
      roundId: roundIdNum,
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      applicationId: applicationId ? parseInt(applicationId, 10) : undefined,
    };

    // Check read permission
    const canRead = await canReadChannel(ctx, session?.address || null);

    if (!canRead) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    // Build query based on channel type
    let query = db
      .selectFrom("messages")
      .select(["id", "authorAddress", "content", "createdAt", "updatedAt"])
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

    return new Response(
      JSON.stringify({
        success: true,
        messages,
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

    // Get round from database
    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    const effectiveRoundId = roundId || round?.id;

    const ctx: ChannelContext = {
      channelType,
      chainId,
      councilId,
      roundId: effectiveRoundId,
      projectId,
      applicationId,
    };

    // Check write permission
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
      if (channelType === "GROUP_ANNOUNCEMENTS") {
        getRoundDetails(effectiveRoundId)
          .then((details) => {
            if (details) {
              return sendAnnouncementEmail(ADMIN_NOTIFICATION_EMAILS, {
                baseUrl,
                roundName: details.roundName,
                chainId: details.chainId,
                councilId: details.councilId,
              });
            }
          })
          .catch((err) =>
            console.error("Failed to send announcement email:", err),
          );
      } else if (messageProjectId) {
        getProjectAndRoundDetails(messageProjectId, effectiveRoundId)
          .then((details) => {
            if (details) {
              return sendChatMessageEmail(ADMIN_NOTIFICATION_EMAILS, {
                baseUrl,
                projectName: details.projectName,
                roundName: details.roundName,
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
