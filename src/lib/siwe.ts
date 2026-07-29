// Long enough for a hardware wallet or a mobile deep link, and for the clock
// skew between the signer and the server that checks it.
export const SIWE_MESSAGE_LIFETIME_MS = 10 * 60_000;
const MAX_SIWE_MESSAGE_LIFETIME_MS = 30 * 60_000;

/**
 * viem enforces `expirationTime` only when the message carries one, so a message
 * without it never expires and its signature stays replayable for good. Absence
 * has to be refused, and an expiry far enough out to be decorative is no better
 * than none.
 */
export function hasUsableExpiry(
  expirationTime: Date | undefined,
  now: Date = new Date(),
): boolean {
  if (!expirationTime) return false;

  const remaining = expirationTime.getTime() - now.getTime();

  return remaining > 0 && remaining <= MAX_SIWE_MESSAGE_LIFETIME_MS;
}
