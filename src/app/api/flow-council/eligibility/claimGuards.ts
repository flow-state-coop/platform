import { verifyMessage as verifyMessageLocally } from "viem";
import type { Address, PublicClient } from "viem";
import { db } from "../db";
import { buildClaimMessage } from "@/app/flow-councils/lib/claimMessage";
import {
  CLAIM_MIN_INTERVAL_MS,
  CLAIM_SIGNATURE_TTL_MS,
  CLAIM_SIGNATURE_SKEW_MS,
} from "@/app/flow-councils/lib/constants";

export type ClaimSignatureResult =
  | { ok: true }
  | { ok: false; code: "invalid_signature" | "expired_signature" };

export function isClaimTimestampFresh(issuedAt: number, now: number): boolean {
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  if (issuedAt > now + CLAIM_SIGNATURE_SKEW_MS) {
    return false;
  }

  return now - issuedAt <= CLAIM_SIGNATURE_TTL_MS;
}

/**
 * Prove the claiming wallet consents, picking the verifier by account type.
 * A contract account goes through the public client action, which is the only
 * thing that resolves ERC-1271 and ERC-6492 and therefore the only reason a
 * Safe can claim at all. Every EOA passes either verifier, so getting this
 * wrong stays invisible until a Safe tries.
 */
export async function verifyClaimSignature({
  client,
  chainId,
  councilId,
  address,
  issuedAt,
  signature,
  now = Date.now(),
}: {
  client: PublicClient;
  chainId: number;
  councilId: string;
  address: string;
  issuedAt: number;
  signature: string;
  now?: number;
}): Promise<ClaimSignatureResult> {
  if (!isClaimTimestampFresh(issuedAt, now)) {
    return { ok: false, code: "expired_signature" };
  }

  const message = buildClaimMessage({ chainId, councilId, address, issuedAt });

  try {
    // The public-client action resolves ERC-1271/6492, which is the only reason
    // a Safe can claim, but it does so by executing the caller's signature bytes
    // on our RPC: the 6492 path deploys a validator that calls an
    // attacker-supplied factory with attacker-supplied calldata. This route is
    // anonymous, so an EOA (the overwhelming majority of claimers) is verified
    // with pure local ECDSA instead, and only a real contract account reaches
    // the on-chain path.
    const code = await client.getCode({ address: address as Address });
    const isContractAccount = !!code && code !== "0x";

    const valid = isContractAccount
      ? await client.verifyMessage({
          address: address as Address,
          message,
          signature: signature as `0x${string}`,
        })
      : await verifyMessageLocally({
          address: address as Address,
          message,
          signature: signature as `0x${string}`,
        });

    return valid ? { ok: true } : { ok: false, code: "invalid_signature" };
  } catch {
    return { ok: false, code: "invalid_signature" };
  }
}

/**
 * Atomically take the council's claim window. A lost claim means a concurrent
 * claim won, so the caller backs off rather than racing the bot's nonce. The
 * window is council-scoped (rounds.lastClaimAt) because a council can have
 * several NFT groups, unlike the metrics window which is group-scoped.
 */
export async function claimRateWindow(
  roundId: number,
  claimedAt: Date,
): Promise<boolean> {
  const threshold = new Date(claimedAt.getTime() - CLAIM_MIN_INTERVAL_MS);

  const claim = await db
    .updateTable("rounds")
    .set({ lastClaimAt: claimedAt })
    .where("id", "=", roundId)
    .where((eb) =>
      eb.or([eb("lastClaimAt", "is", null), eb("lastClaimAt", "<", threshold)]),
    )
    .executeTakeFirst();

  return claim.numUpdatedRows > 0n;
}

/**
 * Give the window back, but only when the transaction was never broadcast.
 * Once broadcast it may still land, so holding the window is what stops a retry
 * from granting votes twice. Restores the previous value, which is null on a
 * council's first-ever claim; setting it back to null is intentional.
 */
export async function releaseRateWindow(
  roundId: number,
  previousLastClaimAt: Date | null,
  claimedAt: Date,
): Promise<void> {
  await db
    .updateTable("rounds")
    .set({ lastClaimAt: previousLastClaimAt })
    .where("id", "=", roundId)
    .where("lastClaimAt", "=", claimedAt)
    .execute()
    .catch((error) => console.error(error));
}
