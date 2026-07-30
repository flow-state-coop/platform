import { db } from "../db";
import { errorResponse } from "../utils";
import { hashApiKey } from "../apiKeys";
import type { Network } from "@/types/network";
import { checkPoolEligibility } from "./auth";
import {
  getNetwork,
  getPoolFromSubgraph,
  isPoolAdminFresh,
  type SplitterPool,
} from "./pool";

export const KEY_COOLDOWN_ERROR =
  "This API key is cooling down after a recently rejected request, please retry later";

export const KEY_CREATOR_NOT_ADMIN_ERROR =
  "The wallet that created this API key is no longer an admin of the pool, so the key no longer grants access. A current admin can mint a replacement";

export type ApiKeyRow = {
  id: number;
  chainId: number;
  poolId: string;
};

export type KeyAuth =
  | { ok: true; key: ApiKeyRow; network: Network; pool: SplitterPool }
  | { ok: false; response: Response };

function unauthorized() {
  return errorResponse("Unauthorized", 401);
}

/**
 * Bearer-token gate for the integrator-facing routes.
 *
 * The pool is derived from the key rather than from a path or query parameter,
 * so a key cannot be pointed at a pool it does not own. An unknown token and a
 * revoked one get the same response, so revocation is not observable.
 *
 * `ignoreCooldown` is for polling a job that was already accepted. The cooldown
 * exists to stop a caller resubmitting bad payloads, and refusing its polls
 * would also refuse the resume they trigger, leaving a half-written register
 * stuck for the length of a penalty it earned on a different request.
 */
export async function authorizeApiKey(
  request: Request,
  { ignoreCooldown = false }: { ignoreCooldown?: boolean } = {},
): Promise<KeyAuth> {
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!provided) return { ok: false, response: unauthorized() };

  const keyRow = await db
    .selectFrom("splitterApiKeys")
    .select([
      "id",
      "chainId",
      "poolId",
      "createdBy",
      "revokedAt",
      "cooldownUntil",
    ])
    .where("keyHash", "=", hashApiKey(provided))
    .executeTakeFirst();

  if (!keyRow || keyRow.revokedAt) {
    return { ok: false, response: unauthorized() };
  }

  // Rejected before any RPC work, and worded distinctly from the in-flight-job
  // and active-key-cap refusals so a caller can tell which limit it hit.
  if (
    !ignoreCooldown &&
    keyRow.cooldownUntil &&
    new Date(keyRow.cooldownUntil) > new Date()
  ) {
    return { ok: false, response: errorResponse(KEY_COOLDOWN_ERROR, 429) };
  }

  const network = getNetwork(keyRow.chainId);
  if (!network) {
    return { ok: false, response: errorResponse("Wrong network", 500) };
  }

  // Independent reads, so they run together: the creator's admin status comes
  // from the chain rather than from the pool record below, and waiting for that
  // record first would only add a round trip.
  const [pool, creatorIsAdmin] = await Promise.all([
    getPoolFromSubgraph(keyRow.chainId, keyRow.poolId),
    keyRow.createdBy
      ? isPoolAdminFresh(
          network,
          keyRow.poolId,
          keyRow.createdBy as `0x${string}`,
        )
      : Promise.resolve(true),
  ]);

  if (!pool) {
    return { ok: false, response: errorResponse("Pool not found", 404) };
  }

  const ineligible = await checkPoolEligibility(network, pool);
  if (ineligible) {
    return {
      ok: false,
      response: errorResponse(ineligible.error, ineligible.status),
    };
  }

  // A key is capability handed out by one admin, and removing that admin
  // on-chain has to take it back with them. Otherwise a co-admin who minted a
  // key before being removed keeps a token that redirects the whole pool.
  //
  // Read from the chain, never from the indexer: minting reads the chain too, so
  // an admin granted moments ago would otherwise mint a key successfully and
  // have its first call refused for not being an admin. Keys minted before this
  // was recorded have no creator to check and are left alone.
  if (!creatorIsAdmin) {
    return {
      ok: false,
      response: errorResponse(KEY_CREATOR_NOT_ADMIN_ERROR, 403),
    };
  }

  return {
    ok: true,
    key: { id: keyRow.id, chainId: keyRow.chainId, poolId: keyRow.poolId },
    network,
    pool,
  };
}

/**
 * Records activity for any request that passes authentication and proceeds to
 * do work, so "Last used" reflects an active key even when its payloads fail
 * validation. Best-effort, so it never fails the request.
 */
export async function touchKey(keyId: number): Promise<void> {
  await db
    .updateTable("splitterApiKeys")
    .set({ lastUsedAt: new Date() })
    .where("id", "=", keyId)
    .execute()
    .catch((err) => console.error(err));
}

/**
 * Per-key backpressure after a request the caller could have avoided: a payload
 * that is deterministically wrong (an invalid address, all weights zero,
 * duplicates). Never called for RPC or chain failures, so a healthy integration
 * is not penalized for our outage.
 */
export async function coolDownKey(
  keyId: number,
  cooldownMs: number,
): Promise<void> {
  await db
    .updateTable("splitterApiKeys")
    .set({ cooldownUntil: new Date(Date.now() + cooldownMs) })
    .where("id", "=", keyId)
    .execute()
    .catch((err) => console.error(err));
}
