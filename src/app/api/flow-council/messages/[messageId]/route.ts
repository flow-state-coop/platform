import { getServerSession } from "next-auth/next";
import {
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  parseAbi,
  Address,
  isAddress,
} from "viem";
import { celo } from "viem/chains";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { ChannelType } from "@/generated/kysely";

export const dynamic = "force-dynamic";

const RECIPIENT_MANAGER_ROLE = keccak256(
  encodePacked(["string"], ["RECIPIENT_MANAGER_ROLE"]),
);

const VOTER_MANAGER_ROLE = keccak256(
  encodePacked(["string"], ["VOTER_MANAGER_ROLE"]),
);

const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

async function hasOnChainRole(
  chainId: number,
  councilId: string,
  address: string,
): Promise<boolean> {
  const network = networks.find((n) => n.id === chainId);
  if (!network) return false;

  const publicClient = createPublicClient({
    chain: celo,
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

async function canModerateChannel(
  message: {
    channelType: ChannelType;
    roundId: number | null;
    projectId: number | null;
  },
  address: string,
  chainId: number,
  councilId: string,
): Promise<boolean> {
  const { channelType, roundId, projectId } = message;

  switch (channelType) {
    case "INTERNAL_APPLICATION":
      // Moderator = any on-chain admin role
      return hasOnChainRole(chainId, councilId, address);

    case "GROUP_ANNOUNCEMENTS":
    case "GROUP_PROJECT":
    case "GROUP_APPLICANTS":
    case "GROUP_GRANTEES":
    case "GROUP_ROUND_ADMINS":
    case "PUBLIC_ROUND": {
      // Moderator = Round admins (db or on-chain)
      if (!roundId) return false;
      const [isDbAdmin, isOnChainAdmin] = await Promise.all([
        isRoundAdmin(roundId, address),
        hasOnChainRole(chainId, councilId, address),
      ]);
      return isDbAdmin || isOnChainAdmin;
    }

    case "PUBLIC_PROJECT":
      // Moderator = Project managers
      if (!projectId) return false;
      return isProjectManager(projectId, address);

    default:
      return false;
  }
}

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

    // Fetch the message
    const message = await db
      .selectFrom("messages")
      .select(["id", "authorAddress"])
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

    // Update the message
    const updatedMessage = await db
      .updateTable("messages")
      .set({
        content: content.trim(),
      })
      .where("id", "=", messageIdNum)
      .returning(["id", "authorAddress", "content", "createdAt", "updatedAt"])
      .executeTakeFirstOrThrow();

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

    // Fetch the message
    const message = await db
      .selectFrom("messages")
      .select(["id", "authorAddress", "channelType", "roundId", "projectId"])
      .where("id", "=", messageIdNum)
      .executeTakeFirst();

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message not found" }),
      );
    }

    const isAuthor =
      message.authorAddress.toLowerCase() === session.address.toLowerCase();

    // Check if user is moderator
    const isModerator = await canModerateChannel(
      message,
      session.address,
      chainId,
      councilId,
    );

    if (!isAuthor && !isModerator) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not authorized to delete this message",
        }),
      );
    }

    // Delete the message
    await db.deleteFrom("messages").where("id", "=", messageIdNum).execute();

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
