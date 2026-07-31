import { createPublicClient, http } from "viem";
import { getViemChain } from "@/lib/networks";
import type { Network } from "@/types/network";
import { getBotSigner, getGroupByMethod } from "../bot";

/**
 * Resolve the "metrics"-eligibility voter group for a council, if one exists.
 * A council has at most one (the bot is a single per-council voter).
 */
export function getMetricsGroup(roundId: number) {
  return getGroupByMethod(roundId, "metrics");
}

/**
 * Resolve the viem account + clients that sign on-chain actions as the Flow
 * State bot, memoized per chain so the ballot hot path doesn't rebuild HTTP
 * transports and re-derive the key on every request. The memo now lives in
 * bot.ts so the claim path shares one signer, and one nonce manager, with this
 * one.
 */
export function getMetricsSigner(network: Network) {
  return getBotSigner(network);
}

const publicClientCache = new Map<
  number,
  ReturnType<typeof createPublicClient>
>();

/**
 * Read-only viem public client for a network, memoized per chain. Unlike
 * getMetricsSigner it needs no signing key, so council reads (e.g. verifying the
 * bot is zeroed on-chain before a metrics group is deleted) don't depend on
 * FLOW_STATE_ELIGIBILITY_PK being configured.
 */
export function getCouncilPublicClient(network: Network) {
  const cached = publicClientCache.get(network.id);
  if (cached) return cached;

  const client = createPublicClient({
    chain: getViemChain(network.id),
    transport: http(network.rpcUrl),
  });
  publicClientCache.set(network.id, client);
  return client;
}

// Re-exported so council routes keep one import site; the implementation is
// shared with flow-splitter keys, which differ only in their token prefix.
export { hashApiKey } from "../../apiKeys";

import { generateApiKey as mintApiKey } from "../../apiKeys";

const API_KEY_PREFIX = "metrics_";

export function generateApiKey() {
  return mintApiKey(API_KEY_PREFIX);
}
