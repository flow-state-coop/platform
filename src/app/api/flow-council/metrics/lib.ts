import crypto from "crypto";
import { createPublicClient, http } from "viem";
import { getViemChain } from "@/lib/networks";
import type { Network } from "@/types/network";
import { buildBotSigner, getGroupByMethod } from "../bot";

/**
 * Resolve the "metrics"-eligibility voter group for a council, if one exists.
 * A council has at most one (the bot is a single per-council voter).
 */
export function getMetricsGroup(roundId: number) {
  return getGroupByMethod(roundId, "metrics");
}

const signerCache = new Map<number, ReturnType<typeof buildBotSigner>>();

/**
 * Resolve the viem account + clients that sign on-chain actions as the Flow
 * State bot, memoized per chain so the ballot hot path doesn't rebuild HTTP
 * transports and re-derive the key on every request. Single seam for the wallet
 * model: today one centralized key signs for every council; a future per-council
 * HD wallet would be derived here from `network`/round instead.
 */
export function getMetricsSigner(network: Network) {
  const cached = signerCache.get(network.id);
  if (cached) return cached;

  const signer = buildBotSigner(network);
  signerCache.set(network.id, signer);
  return signer;
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

function getApiKeySecret(): string {
  const secret = process.env.METRICS_API_KEY_SECRET;
  if (!secret) {
    throw new Error("METRICS_API_KEY_SECRET is not configured");
  }
  return secret;
}

/**
 * Keyed hash of an API token, for both storage and lookup. HMAC rather than a
 * bare sha256 so a leaked `metrics_api_keys` table can't be used to forge usable
 * tokens without also holding the server secret.
 */
export function hashApiKey(token: string): string {
  return crypto
    .createHmac("sha256", getApiKeySecret())
    .update(token)
    .digest("hex");
}

const API_KEY_PREFIX = "metrics_";

/**
 * Mint a new API key. The plaintext `token` is returned to the caller exactly
 * once; only the keyed `hash` is persisted, and `prefix` (the leading 16 chars,
 * non-secret) is stored for display in the management UI.
 */
export function generateApiKey(): {
  token: string;
  hash: string;
  prefix: string;
} {
  const token = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, hash: hashApiKey(token), prefix: token.slice(0, 16) };
}
