import { getServerSession } from "next-auth/next";
import type { Address } from "viem";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  API_INELIGIBILITY_ERRORS,
  IMMUTABLE_POOL_ERROR,
  TRANSFERABLE_POOL_ERROR,
  getApiEligibility,
} from "@/lib/splitterEligibility";
import type { Network } from "@/types/network";
import { allowRequest } from "../rateLimit";
import {
  getNetwork,
  getPoolFromSubgraph,
  isPoolAdminCached,
  isPoolAdminFresh,
  isTransferable,
  type SplitterPool,
} from "./pool";

// Generous next to what the admin page actually does (one keys fetch and one
// history fetch per load, plus a page of history per click), and still low
// enough that a loop cannot drive unbounded subgraph and RPC work.
const ADMIN_REQUEST_LIMIT = 60;
const ADMIN_REQUEST_WINDOW_MS = 60_000;

export type PoolAdminAuth =
  | {
      ok: true;
      address: string;
      network: Network;
      pool: SplitterPool;
    }
  | { ok: false; error: string; status: number };

export { IMMUTABLE_POOL_ERROR, TRANSFERABLE_POOL_ERROR };

export const BOT_NOT_ADMIN_ERROR =
  "The Flow State bot is not an admin of this pool, so it cannot update shares. Grant it admin access from the pool's admin page";

/**
 * Refusals that apply to every API surface on a pool, read from the chain
 * rather than from the admin page's form state. A pool switched to "No Admin"
 * after its keys were minted must stop serving reads as well as writes.
 *
 * The decision itself lives in `getApiEligibility`, the same predicate the
 * admin page renders from, so the two surfaces cannot disagree about which
 * pools are eligible. The transferability read is skipped for a pool with no
 * admins, which the predicate refuses before looking at it.
 */
export async function checkPoolEligibility(
  network: Network,
  pool: SplitterPool,
): Promise<{ error: string; status: number } | null> {
  const hasAdmins = pool.adminAddresses.length > 0;

  const eligibility = getApiEligibility({
    hasAdmins,
    transferableUnits: hasAdmins
      ? await isTransferable(network, pool.poolAddress)
      : undefined,
  });

  return eligibility.status === "unavailable"
    ? { error: API_INELIGIBILITY_ERRORS[eligibility.reason], status: 409 }
    : null;
}

/**
 * SIWE plus an on-chain admin check, for the pool-admin-facing routes (keys,
 * history, the merged allocation the API section shows). The admin page itself
 * still opens with only a connected wallet; this gates the privileged actions.
 *
 * The bot's own admin status is deliberately not read here. No route reports
 * it: the admin page reads it from the chain itself, because it has to show it
 * before anyone signs in, and every caller here was paying for an eth_call it
 * discarded.
 *
 * The admin check is read from the chain unless a caller opts into the cache,
 * which only the routes whose whole effect is the response they return may do.
 * Minting a key hands out write capability that is never re-authorized against
 * the chain afterwards, so a stale `true` there survives revocation.
 */
export async function authorizePoolAdmin(
  chainId: number,
  poolId: string,
  { allowCachedRole = false }: { allowCachedRole?: boolean } = {},
): Promise<PoolAdminAuth> {
  const network = getNetwork(chainId);
  if (!network) {
    return { ok: false, error: "Wrong network", status: 400 };
  }

  const session = await getServerSession(authOptions);
  if (!session?.address) {
    return { ok: false, error: "Unauthenticated", status: 401 };
  }

  // Before the subgraph and the chain, because that is the work being
  // protected: a SIWE session is self-serve, so without this any wallet can
  // loop any pool id and spend our upstream quota. That quota is shared with
  // the RPC the bot broadcasts through, so this is not only about these routes.
  if (
    !allowRequest(
      "splitter-admin",
      session.address.toLowerCase(),
      ADMIN_REQUEST_LIMIT,
      ADMIN_REQUEST_WINDOW_MS,
    )
  ) {
    return {
      ok: false,
      error: "Too many requests, please retry in a moment",
      status: 429,
    };
  }

  const pool = await getPoolFromSubgraph(chainId, poolId);
  if (!pool) {
    return { ok: false, error: "Pool not found", status: 404 };
  }

  // Independent once the pool is known, and each is a separate RPC round trip,
  // so they run together. Eligibility still takes precedence over the admin
  // check, matching the order a sequential version reported them in.
  const readAdmin = allowCachedRole ? isPoolAdminCached : isPoolAdminFresh;

  const [ineligible, callerIsAdmin] = await Promise.all([
    checkPoolEligibility(network, pool),
    readAdmin(network, poolId, session.address as Address),
  ]);

  if (ineligible) {
    return { ok: false, ...ineligible };
  }

  if (!callerIsAdmin) {
    return {
      ok: false,
      error: "Not authorized to manage this pool",
      status: 403,
    };
  }

  return {
    ok: true,
    address: (session.address as string).toLowerCase(),
    network,
    pool,
  };
}
