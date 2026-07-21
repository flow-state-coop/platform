import { verifyMessage as verifyMessageLocally } from "viem";
import type { Address, PublicClient } from "viem";
import { gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";
import { db } from "../db";
import { buildClaimMessage } from "@/app/flow-councils/lib/claimMessage";
import {
  CLAIM_MIN_INTERVAL_MS,
  CLAIM_SIGNATURE_TTL_MS,
  CLAIM_SIGNATURE_SKEW_MS,
} from "@/app/flow-councils/lib/constants";

const COUNCIL_EXISTS_QUERY = gql`
  query FlowCouncilExists($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
    }
  }
`;

const factoryCouncils = new Set<string>();

/** Drop the verified-council cache. Used by tests to control the guard. */
export function resetFactoryCouncilCache() {
  factoryCouncils.clear();
}

/**
 * Confirm a council was actually deployed by the Flow Council factory before
 * the bot spends gas on it.
 *
 * Registering a round only proves the caller passed the candidate contract's
 * own `hasRole` check, which a contract can simply answer `true` to. Without
 * this, anyone could register a contract they wrote, point an NFT group at a
 * second contract whose `balanceOf` always returns 1, and have the bot pay for
 * unlimited `addVoter` calls. The subgraph only indexes FlowCouncilCreated
 * events from the factory, so presence there is the proof.
 *
 * Fails closed: an unreachable subgraph refuses the claim rather than spending.
 * Only positives are cached, since a council cannot become un-created.
 */
export async function isFactoryCouncil(
  chainId: number,
  councilId: string,
): Promise<boolean> {
  const key = `${chainId}:${councilId.toLowerCase()}`;

  if (factoryCouncils.has(key)) {
    return true;
  }

  try {
    const { data } = await getApolloClient("flowCouncil", chainId).query({
      query: COUNCIL_EXISTS_QUERY,
      variables: { councilId: councilId.toLowerCase() },
      fetchPolicy: "no-cache",
    });

    if (!data?.flowCouncil?.id) {
      return false;
    }

    factoryCouncils.add(key);
    return true;
  } catch (err) {
    console.error("Council factory verification failed:", err);
    return false;
  }
}

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
