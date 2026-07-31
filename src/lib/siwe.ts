// The expiry is stamped from the signer's own clock and checked against the
// server's, so the gap between these two constants is the whole skew budget: a
// browser behind by more than the lifetime signs a message that is already
// expired on arrival, and one ahead by more than the remainder signs one the
// server reads as decorative. Both directions have to fit, with room left for a
// hardware wallet or a mobile deep link.
export const SIWE_MESSAGE_LIFETIME_MS = 20 * 60_000;
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
