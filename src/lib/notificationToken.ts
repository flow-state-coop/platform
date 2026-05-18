import crypto from "crypto";

function getSecret(): string {
  const secret = process.env.NOTIFICATION_HMAC_SECRET;
  if (!secret) {
    throw new Error("NOTIFICATION_HMAC_SECRET is not configured");
  }
  return secret;
}

export function generateNotificationToken(
  address: string,
  emailVersion: number,
): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${address.toLowerCase()}|${emailVersion}`)
    .digest("base64url");
}

export function verifyNotificationToken(
  address: string,
  emailVersion: number,
  token: string,
): boolean {
  const expected = generateNotificationToken(address, emailVersion);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(token);
  if (expectedBuf.length !== providedBuf.length) return false;
  try {
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
