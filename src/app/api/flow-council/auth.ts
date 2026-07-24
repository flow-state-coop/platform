import { createPublicClient, http, parseAbi, Address, isAddress } from "viem";
import { getServerSession } from "next-auth/next";
import { gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";
import { db } from "./db";
import { networks, getViemChain } from "@/lib/networks";
import { ChannelType } from "@/generated/kysely";
import { authOptions } from "../auth/[...nextauth]/route";
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
    chain: getViemChain(network.id),
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
): Promise<{ id: number; applicationsClosed: boolean } | undefined> {
  return db
    .selectFrom("rounds")
    .select(["id", "applicationsClosed"])
    .where("chainId", "=", chainId)
    .where("flowCouncilAddress", "=", councilAddress.toLowerCase())
    .executeTakeFirst();
}

export type CouncilManagerAuth =
  | { ok: true; roundId: number }
  | { ok: false; error: string; status: number };

/**
 * SIWE + on-chain-role gate shared by the voter-group management routes.
 * Validates the network and council address, requires an authenticated session,
 * resolves the round, and confirms the caller holds a managing role on the
 * council. Returns the round id on success or a typed error + HTTP status.
 */
export async function authorizeCouncilManager(
  chainId: unknown,
  councilId: unknown,
): Promise<CouncilManagerAuth> {
  const network = networks.find((n) => n.id === chainId);

  if (!network) {
    return { ok: false, error: "Wrong network", status: 400 };
  }

  if (typeof councilId !== "string" || !isAddress(councilId)) {
    return { ok: false, error: "Invalid council ID", status: 400 };
  }

  const session = await getServerSession(authOptions);

  if (!session?.address) {
    return { ok: false, error: "Unauthenticated", status: 401 };
  }

  const round = await findRoundByCouncil(chainId as number, councilId);

  if (!round) {
    return { ok: false, error: "Round not found", status: 404 };
  }

  const hasRole = await hasOnChainRole(
    chainId as number,
    councilId,
    session.address,
  );

  if (!hasRole) {
    return {
      ok: false,
      error: "Not authorized to manage this council",
      status: 403,
    };
  }

  return { ok: true, roundId: round.id };
}

export const adminCache = new Map<string, { value: boolean; expiry: number }>();
const ADMIN_CACHE_TTL = 60_000;

export async function isAdmin(
  roundId: number,
  chainId: number,
  councilId: string,
  address: string,
): Promise<boolean> {
  const cacheKey = `${roundId}:${chainId}:${councilId}:${address}`;
  const cached = adminCache.get(cacheKey);

  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  const [isDbAdmin, isOnChainAdmin] = await Promise.all([
    isRoundAdmin(roundId, address),
    hasOnChainRole(chainId, councilId, address),
  ]);
  const result = isDbAdmin || isOnChainAdmin;

  adminCache.set(cacheKey, {
    value: result,
    expiry: Date.now() + ADMIN_CACHE_TTL,
  });

  return result;
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

const COUNCIL_EXISTS_QUERY = gql`
  query FlowCouncilExists($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
    }
  }
`;

const FACTORY_COUNCIL_CACHE_LIMIT = 500;

// Map instead of Set for LRU behavior: a hit re-inserts its key, so eviction
// drops the least recently used council, not the busiest early one.
const factoryCouncils = new Map<string, true>();

/** Drop the verified-council cache, so tests can control the guard. */
export function resetFactoryCouncilCache() {
  factoryCouncils.clear();
}

/**
 * The subgraph only indexes FlowCouncilCreated events from the factory, so
 * presence there is the proof of origin. Fails closed, and caches only
 * positives since a council cannot become un-created.
 */
export async function isFactoryCouncil(
  chainId: number,
  councilId: string,
): Promise<boolean> {
  const key = `${chainId}:${councilId.toLowerCase()}`;

  if (factoryCouncils.has(key)) {
    factoryCouncils.delete(key);
    factoryCouncils.set(key, true);
    return true;
  }

  try {
    const { data } = await getApolloClient("flowCouncil", chainId).query({
      query: COUNCIL_EXISTS_QUERY,
      variables: { councilId: councilId.toLowerCase() },
      fetchPolicy: "no-cache",
    });

    if (!data?.flowCouncil?.id) {
      return false;
    }

    if (factoryCouncils.size >= FACTORY_COUNCIL_CACHE_LIMIT) {
      factoryCouncils.delete(factoryCouncils.keys().next().value as string);
    }

    factoryCouncils.set(key, true);
    return true;
  } catch (err) {
    console.error("Council factory verification failed:", err);
    return false;
  }
}
