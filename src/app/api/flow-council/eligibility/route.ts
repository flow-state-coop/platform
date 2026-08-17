import { Address, isAddress, type PublicClient } from "viem";
import { getServerSession } from "next-auth/next";
import type { Transaction } from "kysely";
import type { DB } from "@/generated/kysely";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { findRoundByCouncil } from "../auth";
import { getBotSigner, getGroupByMethod, sendBotTransaction } from "../bot";
import { ChainBusyError } from "../../botLock";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import { getCouncilPublicClient } from "../metrics/lib";
import { getCeloIdentityClient, loadVotingRoots } from "../gooddollar";
import { verifyClaimSignature } from "./claimGuards";
import { resolveVerifiedRoot } from "@/app/flow-councils/lib/goodDollarIdentity";

export const dynamic = "force-dynamic";

// Another wallet connected to the same identity holds the council's single slot
// for it.
class IdentityAlreadyClaimed extends Error {}

// The identity was released between this request's failed insert and the read
// that would name its holder, so the claim is worth another attempt rather than
// a verdict.
class ClaimRaceError extends Error {}

// Which wallet holds the slot stays server-side. Nothing authenticates this
// route, so returning it would let anyone resolve a wallet to the others its
// holder connected to the same identity.
function alreadyClaimedResponse() {
  return Response.json({
    success: false,
    alreadyClaimed: true,
    error: "This GoodDollar identity already voted from another wallet",
  });
}

/**
 * Take the council's single slot for a GoodDollar identity, or confirm the
 * claiming wallet already holds it.
 *
 * Returns the id of the row this request inserted, or null when the wallet was
 * already the holder: only a row we inserted may be rolled back, else a failed
 * re-claim would release a slot the wallet is still using.
 */
async function claimIdentity(
  trx: Transaction<DB>,
  roundId: number,
  rootAddress: string,
  claimingAddress: string,
): Promise<number | null> {
  const inserted = await trx
    .insertInto("gooddollarClaimedRoots")
    .values({ roundId, rootAddress, address: claimingAddress })
    .onConflict((oc) => oc.columns(["roundId", "rootAddress"]).doNothing())
    .returning(["id"])
    .executeTakeFirst();

  if (inserted) {
    return inserted.id;
  }

  // Locked rather than just read: an admin removing the holder drops the claim
  // and the membership row together, and without the lock that removal could
  // land between this read and the membership insert below, leaving the
  // identity unclaimed while this wallet keeps voting.
  const holder = await trx
    .selectFrom("gooddollarClaimedRoots")
    .select(["address"])
    .where("roundId", "=", roundId)
    .where("rootAddress", "=", rootAddress)
    .forUpdate()
    .executeTakeFirst();

  if (!holder) {
    throw new ClaimRaceError(
      `Claim on ${rootAddress} was released mid-request for round ${roundId}`,
    );
  }

  if (holder.address !== claimingAddress) {
    throw new IdentityAlreadyClaimed();
  }

  return null;
}

export async function POST(request: Request) {
  // Self-claim is gated per council: a request only succeeds when the council
  // has a "gooddollar" voter group (getGroupByMethod below) and the bot holds
  // VOTER_MANAGER_ROLE (else addVoter reverts). Revoking that role is the kill
  // switch.
  try {
    const { address, chainId, councilId, signature, issuedAt } =
      await request.json();

    if (!address || !chainId || !councilId) {
      return Response.json({ success: false, error: "Invalid request" });
    }

    const numericChainId = Number(chainId);

    if (!Number.isInteger(numericChainId)) {
      return Response.json({ success: false, error: "Invalid chainId" });
    }

    // Validate both as real addresses before they reach a viem contract call or
    // a DB insert — a non-address string would otherwise be written verbatim
    // into voter_group_members (VARCHAR(42) accepts any short string).
    if (!isAddress(address) || !isAddress(councilId)) {
      return Response.json({ success: false, error: "Invalid address" });
    }

    const network = networks.find((network) => network.id === numericChainId);

    if (!network) {
      return Response.json({ success: false, error: "Wrong network" });
    }

    const round = await findRoundByCouncil(numericChainId, councilId);

    if (!round) {
      return Response.json({ success: false, error: "Council not found" });
    }

    const goodDollarGroup = await getGroupByMethod(round.id, "gooddollar");

    if (!goodDollarGroup) {
      return Response.json({
        success: false,
        error: "GoodDollar eligibility is not enabled for this council",
      });
    }

    // The claim binds an identity's single slot to this address permanently, so
    // it has to come from the wallet itself. Without proof of control any caller
    // could pick which of a holder's connected wallets gets the spot, and burn
    // the identity on one they no longer use.
    //
    // A SIWE session for the same wallet is that proof already, and connecting
    // prompts for one, so the common path costs no second signature. The claim
    // signature covers everyone who dismissed that prompt, since sign-in is
    // optional here and refusing them the claim would be worse.
    const session = await getServerSession(authOptions);
    const provenBySignIn =
      session?.address?.toLowerCase() === (address as string).toLowerCase();

    if (!provenBySignIn) {
      const verification = await verifyClaimSignature({
        client: getCouncilPublicClient(network) as PublicClient,
        chainId: numericChainId,
        councilId,
        address,
        issuedAt: Number(issuedAt),
        signature: typeof signature === "string" ? signature : "",
      });

      if (!verification.ok) {
        // The two failures need different things from the client: an expired
        // timestamp is fixed by signing again, a bad signature never is.
        // Flattening them leaves a claimer whose clock drifted with a dead
        // button and no way to know a retry would work.
        return Response.json({
          success: false,
          reason: verification.code,
          error:
            verification.code === "expired_signature"
              ? "Signature expired, please sign again"
              : "Invalid signature",
        });
      }
    }

    // The claiming wallet may be one its holder connected to a GoodDollar
    // identity anchored elsewhere, so eligibility is decided on the root. The
    // root never becomes the voter, though: the ballot is signed by the wallet
    // in front of us.
    const root = await resolveVerifiedRoot(
      getCeloIdentityClient(),
      address as Address,
    );

    // notWhitelisted marks the one failure that should send the user into
    // face verification; every other success:false is an error the client
    // should treat as retryable instead.
    if (!root) {
      return Response.json({
        success: false,
        notWhitelisted: true,
        error: "Not whitelisted",
      });
    }

    const claimingAddress = (address as string).toLowerCase();
    const rootAddress = root.toLowerCase();

    // Councils that enabled GoodDollar after their voters were added carry no
    // claim for them, so the root voting here is what marks the slot taken.
    // A root claiming for itself is exempt because it can only ever be the one
    // voter its identity is entitled to: the claim below either records it or
    // conflicts and finds this same wallet already holding the slot.
    if (rootAddress !== claimingAddress) {
      const votingRoots = await loadVotingRoots(round.id, [rootAddress]);

      if (votingRoots.has(rootAddress)) {
        return alreadyClaimedResponse();
      }
    }

    // Resolved before anything is written: a missing bot key would otherwise
    // throw with the claim and the membership row already committed and no
    // on-chain voter to go with them.
    const { account, publicClient, walletClient } = getBotSigner(network);

    // One identity, one slot, and the membership row that goes with it. Without
    // the claim an identity's holder claims once per wallet they have connected
    // to it, since each carries a different address; without one transaction a
    // failure between the two orphans whichever row landed first.
    let claimedRootId: number | null;
    let memberId: number | null;
    let existingGroupId: number | null;

    try {
      ({ claimedRootId, memberId, existingGroupId } = await db
        .transaction()
        .execute(async (trx) => {
          const claimed = await claimIdentity(
            trx,
            round.id,
            rootAddress,
            claimingAddress,
          );

          // The UNIQUE(round_id, address) constraint means an address already
          // in any group on this council yields no row (single-group
          // membership: the existing group wins).
          const inserted = await trx
            .insertInto("voterGroupMembers")
            .values({
              voterGroupId: goodDollarGroup.id,
              roundId: round.id,
              address: claimingAddress,
            })
            .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
            .returning(["id"])
            .executeTakeFirst();

          if (inserted) {
            return {
              claimedRootId: claimed,
              memberId: inserted.id,
              existingGroupId: null,
            };
          }

          // Which group holds the address decides what the conflict means, so
          // it is read back here, where a removal racing this request still
          // rolls the claim above back with the rest of the transaction.
          const existing = await trx
            .selectFrom("voterGroupMembers")
            .select(["voterGroupId"])
            .where("roundId", "=", round.id)
            .where("address", "=", claimingAddress)
            .executeTakeFirst();

          if (!existing) {
            throw new ClaimRaceError(
              `Membership of ${claimingAddress} was released mid-request for round ${round.id}`,
            );
          }

          return {
            claimedRootId: claimed,
            memberId: null,
            existingGroupId: existing.voterGroupId,
          };
        }));
    } catch (err) {
      if (err instanceof IdentityAlreadyClaimed) {
        return alreadyClaimedResponse();
      }

      // The slot changed hands mid-request, so there is no verdict to give,
      // only a clean re-attempt. Named here rather than left to the generic
      // 500 so the race reads as what it is.
      if (err instanceof ClaimRaceError) {
        return Response.json(
          { success: false, error: "The claim was contested, please retry" },
          { status: 409 },
        );
      }

      throw err;
    }

    // Roll back so a retry can re-attempt the on-chain call. The claimed root
    // goes with it, but only when this request is what recorded it, else a
    // failed re-claim would release a slot another wallet is still holding.
    // One transaction, so a half-applied rollback can't drop the voter while
    // leaving the identity claimed, and the claim goes first because that is
    // the order the claim above took the two in; the reverse deadlocks against
    // an admin's removal. Guard the rollback itself: if it throws, log it but
    // still surface the original error to the caller, rather than letting the
    // rollback failure propagate to the outer catch.
    const rollback = async (
      memberRowId: number | null,
      claimRowId: number | null,
    ) => {
      try {
        await db.transaction().execute(async (trx) => {
          if (claimRowId) {
            await trx
              .deleteFrom("gooddollarClaimedRoots")
              .where("id", "=", claimRowId)
              .execute();
          }

          if (memberRowId) {
            await trx
              .deleteFrom("voterGroupMembers")
              .where("id", "=", memberRowId)
              .execute();
          }
        });
      } catch (rollbackErr) {
        console.error("Failed to roll back voter membership row:", rollbackErr);
      }
    };

    // No row inserted means this wallet is already a member here. In another
    // group, the existing membership and its allocation stand, so there is
    // nothing to broadcast, and certainly not an addVoter at this group's
    // default power.
    if (!memberId && existingGroupId !== goodDollarGroup.id) {
      return Response.json({ success: true });
    }

    // In this group, the row is an earlier attempt whose receipt wait timed
    // out. Only the chain says whether that attempt's addVoter ever landed:
    // answering success on the row alone leaves a wallet whose broadcast was
    // dropped confirmed here, holding its identity's only slot, with no vote on
    // the council and no retry that can repair it, since every retry reads the
    // same row and gives the same answer.
    if (!memberId) {
      let votingPower = 0n;

      try {
        ({ votingPower } = await publicClient.readContract({
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "getVoter",
          args: [address as Address],
        }));
      } catch (err) {
        // getVoter reverts for an account the council doesn't know, which an
        // RPC failure is indistinguishable from here. Either way the broadcast
        // below settles it, since a voter that is already added answers
        // ALREADY_ADDED and that is read as success.
        console.error(err);
      }

      if (votingPower > 0n) {
        return Response.json({ success: true });
      }
    }

    let hash: `0x${string}`;

    // Split from the wait below because the two failures answer differently,
    // not because a throw here proves nothing was sent. A connection the RPC
    // dropped after the node took the transaction throws here too, and still
    // mines.
    try {
      hash = await sendBotTransaction(network, (nonce) =>
        walletClient.writeContract({
          account,
          nonce,
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "addVoter",
          args: [
            address as Address,
            BigInt(goodDollarGroup.defaultVotingPower),
          ],
        }),
      );
    } catch (err) {
      const errorMessage =
        (err as Error)?.message ?? "There was an error, please try again later";

      // Already added on-chain: the membership row is recorded, treat as success.
      if (errorMessage.includes("ALREADY_ADDED")) {
        return Response.json({ success: true });
      }

      // Contention on the shared bot key is raised by the lock before anything
      // reaches an RPC, so it is the one throw that proves nothing was
      // broadcast and the rows can be rolled back for a clean retry, said with
      // a status as the sibling routes do.
      if (err instanceof ChainBusyError) {
        await rollback(memberId, claimedRootId);

        return Response.json(
          { success: false, error: "Too many requests, please retry later" },
          { status: 429 },
        );
      }

      // Anything else may have thrown after the node accepted the transaction,
      // which still mines. Rolling back would free the identity slot while the
      // on-chain voter lands, handing a sibling wallet a second vote, so the
      // rows stay and the next attempt self-repairs through the getVoter check
      // above, exactly as the receipt-wait path below does.
      //
      // Log the raw error server-side only — RPC/contract errors can embed
      // provider URLs, contract addresses, or revert data, so never return the
      // message to the client.
      console.error(err);

      return Response.json({
        success: false,
        error: "There was an error, please try again later",
      });
    }

    let status: "success" | "reverted";

    try {
      ({ status } = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 3,
      }));
    } catch (err) {
      // The transaction is broadcast and can still mine, most often because
      // waiting for confirmations timed out rather than because it failed.
      // Releasing the identity here would let a second connected wallet claim a
      // second on-chain voter, so the rows stay and a retry reports the
      // membership that is already recorded.
      console.error(err);

      return Response.json({
        success: false,
        error: "There was an error, please try again later",
      });
    }

    // Mined and reverted is final, so the rows can go back and a retry can
    // re-attempt the call. viem resolves rather than throws on a revert, so
    // without this the claim would keep a slot no on-chain voter holds.
    if (status !== "success") {
      await rollback(memberId, claimedRootId);

      return Response.json({
        success: false,
        error: "There was an error, please try again later",
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    // Only errors before the on-chain call reach here (JSON parse, address
    // validation, DB queries) — none produce ALREADY_ADDED, which the catch
    // around the broadcast handles.
    console.error(err);

    return Response.json({
      success: false,
      error: "There was an error, please try again later",
    });
  }
}
