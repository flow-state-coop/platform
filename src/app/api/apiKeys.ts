import crypto from "crypto";

// One HMAC secret covers every API key the platform mints, council and
// splitter alike. Tokens are namespaced by prefix instead, so a splitter key
// can never be presented as a council key; renaming the variable would be a
// breaking config change for no security gain.
function getApiKeySecret(): string {
  const secret = process.env.METRICS_API_KEY_SECRET;
  if (!secret) {
    throw new Error("METRICS_API_KEY_SECRET is not configured");
  }
  return secret;
}

/**
 * Keyed hash of an API token, for both storage and lookup. HMAC rather than a
 * bare sha256 so a leaked key table can't be used to forge usable tokens
 * without also holding the server secret.
 */
export function hashApiKey(token: string): string {
  return crypto
    .createHmac("sha256", getApiKeySecret())
    .update(token)
    .digest("hex");
}

/**
 * Mint a new API key. The plaintext `token` is returned to the caller exactly
 * once; only the keyed `hash` is persisted, and `prefix` (the leading 16 chars,
 * non-secret) is stored for display in the management UI.
 */
export function generateApiKey(namespace: string): {
  token: string;
  hash: string;
  prefix: string;
} {
  const token = `${namespace}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, hash: hashApiKey(token), prefix: token.slice(0, 16) };
}
