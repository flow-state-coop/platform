import { createPublicClient, http, parseAbi, Address } from "viem";
import { celo } from "viem/chains";
import { db } from "./db";
import { networks } from "@/lib/networks";
import { ChannelType } from "@/generated/kysely";
import {
  DEFAULT_ADMIN_ROLE,
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
} from "@/app/flow-councils/lib/constants";

export type AuthorAffiliation = {
  isAdmin: boolean;
  projectName: string | null;
};

export type ChannelContext = {
  channelType: ChannelType;
  chainId: number;
  councilId: string;
  roundId?: number;
  projectId?: number;
  applicationId?: number;
};

export async function hasOnChainRole(
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
          args: [DEFAULT_ADMIN_ROLE, address as Address],
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

export async function isRoundAdmin(
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

export async function isProjectManager(
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

export async function isAcceptedGrantee(
  roundId: number,
  address: string,
): Promise<boolean> {
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

export async function findRoundByCouncil(
  chainId: number,
  councilAddress: string,
): Promise<{ id: number } | undefined> {
  return db
    .selectFrom("rounds")
    .select("id")
    .where("chainId", "=", chainId)
    .where("flowCouncilAddress", "=", councilAddress.toLowerCase())
    .executeTakeFirst();
}

async function isAdmin(
  roundId: number,
  chainId: number,
  councilId: string,
  address: string,
): Promise<boolean> {
  const [isDbAdmin, isOnChainAdmin] = await Promise.all([
    isRoundAdmin(roundId, address),
    hasOnChainRole(chainId, councilId, address),
  ]);
  return isDbAdmin || isOnChainAdmin;
}

export async function canReadChannel(
  ctx: ChannelContext,
  address: string | null,
): Promise<boolean> {
  const { channelType, chainId, councilId, roundId, projectId } = ctx;

  if (channelType === "PUBLIC_ROUND" || channelType === "PUBLIC_PROJECT") {
    return true;
  }

  if (!address) return false;

  switch (channelType) {
    case "INTERNAL_APPLICATION":
      return hasOnChainRole(chainId, councilId, address);

    case "GROUP_ANNOUNCEMENTS": {
      if (!roundId) return false;
      const [isGrantee, hasAdminRole] = await Promise.all([
        isAcceptedGrantee(roundId, address),
        isAdmin(roundId, chainId, councilId, address),
      ]);
      return isGrantee || hasAdminRole;
    }

    case "GROUP_PROJECT": {
      if (!projectId || !roundId) return false;
      const [isProjManager, hasAdminRole] = await Promise.all([
        isProjectManager(projectId, address),
        isAdmin(roundId, chainId, councilId, address),
      ]);
      return isProjManager || hasAdminRole;
    }

    case "GROUP_APPLICANTS":
    case "GROUP_GRANTEES":
    case "GROUP_ROUND_ADMINS":
      if (!roundId) return false;
      return isAdmin(roundId, chainId, councilId, address);

    default:
      return false;
  }
}

export async function canWriteChannel(
  ctx: ChannelContext,
  address: string,
): Promise<boolean> {
  const { channelType, chainId, councilId, roundId, projectId } = ctx;

  switch (channelType) {
    case "INTERNAL_APPLICATION":
      return hasOnChainRole(chainId, councilId, address);

    case "GROUP_PROJECT": {
      if (!projectId || !roundId) return false;
      const [isProjManager, hasAdminRole] = await Promise.all([
        isProjectManager(projectId, address),
        isAdmin(roundId, chainId, councilId, address),
      ]);
      return isProjManager || hasAdminRole;
    }

    case "PUBLIC_PROJECT":
      if (!projectId) return false;
      return isProjectManager(projectId, address);

    case "GROUP_ANNOUNCEMENTS":
    case "PUBLIC_ROUND":
    case "GROUP_APPLICANTS":
    case "GROUP_GRANTEES":
    case "GROUP_ROUND_ADMINS":
      if (!roundId) return false;
      return isAdmin(roundId, chainId, councilId, address);

    default:
      return false;
  }
}

export async function canModerateChannel(
  ctx: ChannelContext,
  address: string,
): Promise<boolean> {
  const { channelType, chainId, councilId, roundId, projectId } = ctx;

  switch (channelType) {
    case "INTERNAL_APPLICATION":
      return hasOnChainRole(chainId, councilId, address);

    case "GROUP_ANNOUNCEMENTS":
    case "GROUP_PROJECT":
    case "GROUP_APPLICANTS":
    case "GROUP_GRANTEES":
    case "GROUP_ROUND_ADMINS":
    case "PUBLIC_ROUND":
      if (!roundId) return false;
      return isAdmin(roundId, chainId, councilId, address);

    case "PUBLIC_PROJECT":
      if (!projectId) return false;
      return isProjectManager(projectId, address);

    default:
      return false;
  }
}
