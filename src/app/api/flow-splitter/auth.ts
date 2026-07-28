import { getServerSession } from "next-auth/next";
import type { Address } from "viem";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import type { Network } from "@/types/network";
import {
  getNetwork,
  getPoolFromSubgraph,
  isBotPoolAdmin,
  isPoolAdmin,
  isTransferable,
  type SplitterPool,
} from "./pool";

export type PoolAdminAuth =
  | {
      ok: true;
      network: Network;
      pool: SplitterPool;
      botIsAdmin: boolean;
    }
  | { ok: false; error: string; status: number };

export const IMMUTABLE_POOL_ERROR =
  "This pool has no admins and is permanently immutable, so it cannot be API-driven";

export const TRANSFERABLE_POOL_ERROR =
  "The API does not support pools with transferable units, because recipients can move units between writes";

export const BOT_NOT_ADMIN_ERROR =
  "The Flow State bot is not an admin of this pool, so it cannot update shares. Grant it admin access from the pool's admin page";

/**
 * Refusals that apply to every API surface on a pool, read from the chain
 * rather than from the admin page's form state. A pool switched to "No Admin"
 * after its keys were minted must stop serving reads as well as writes.
 */
export async function checkPoolEligibility(
  network: Network,
  pool: SplitterPool,
): Promise<{ error: string; status: number } | null> {
  if (pool.adminAddresses.length === 0) {
    return { error: IMMUTABLE_POOL_ERROR, status: 409 };
  }

  if (await isTransferable(network, pool.poolAddress)) {
    return { error: TRANSFERABLE_POOL_ERROR, status: 409 };
  }

  return null;
}

/**
 * SIWE plus an on-chain admin check, for the pool-admin-facing routes (keys,
 * history, the merged allocation the API section shows). The admin page itself
 * still opens with only a connected wallet; this gates the privileged actions.
 */
export async function authorizePoolAdmin(
  chainId: number,
  poolId: string,
): Promise<PoolAdminAuth> {
  const network = getNetwork(chainId);
  if (!network) {
    return { ok: false, error: "Wrong network", status: 400 };
  }

  const session = await getServerSession(authOptions);
  if (!session?.address) {
    return { ok: false, error: "Unauthenticated", status: 401 };
  }

  const pool = await getPoolFromSubgraph(chainId, poolId);
  if (!pool) {
    return { ok: false, error: "Pool not found", status: 404 };
  }

  const ineligible = await checkPoolEligibility(network, pool);
  if (ineligible) {
    return { ok: false, ...ineligible };
  }

  const callerIsAdmin = await isPoolAdmin(
    network,
    poolId,
    session.address as Address,
  );
  if (!callerIsAdmin) {
    return {
      ok: false,
      error: "Not authorized to manage this pool",
      status: 403,
    };
  }

  return {
    ok: true,
    network,
    pool,
    botIsAdmin: await isBotPoolAdmin(network, poolId),
  };
}
