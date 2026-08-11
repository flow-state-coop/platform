import { Address, isAddress } from "viem";
import { db } from "../db";
import { findRoundByCouncil } from "../auth";
import { getBotSigner, getGroupByMethod, sendBotTransaction } from "../bot";
import { ChainBusyError } from "../../botLock";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import {
  createCeloIdentityClient,
  resolveVerifiedRoot,
} from "@/app/flow-councils/lib/goodDollarIdentity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Self-claim is gated per council: a request only succeeds when the council
  // has a "gooddollar" voter group (getGroupByMethod below) and the bot holds
  // VOTER_MANAGER_ROLE (else addVoter reverts). Revoking that role is the kill
  // switch.
  try {
    const { address, chainId, councilId } = await request.json();

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

    const celoPublicClient = createCeloIdentityClient();

    if (!celoPublicClient) {
      return Response.json({ success: false, error: "Celo network missing" });
    }

    // The claiming wallet may be one its holder connected to a GoodDollar
    // identity anchored elsewhere, so eligibility is decided on the root. The
    // root never becomes the voter, though: the ballot is signed by the wallet
    // in front of us.
    const root = await resolveVerifiedRoot(
      celoPublicClient,
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

    // One identity, one slot. Without this an identity's holder claims once per
    // wallet they have connected to it, since each carries a different address.
    const claimed = await db
      .selectFrom("gooddollarClaimedRoots")
      .select(["address"])
      .where("roundId", "=", round.id)
      .where("rootAddress", "=", rootAddress)
      .executeTakeFirst();

    // Which wallet holds the slot stays server-side. Nothing authenticates this
    // route, so returning it would let anyone resolve a wallet to the others
    // its holder connected to the same identity.
    if (claimed && claimed.address !== claimingAddress) {
      return Response.json({
        success: false,
        alreadyClaimed: true,
        error: "This GoodDollar identity already voted from another wallet",
      });
    }

    // Claim the identity before the membership row, so the gate also covers a
    // wallet that is already a voter through another group: that path returns
    // early below without ever reaching an insert.
    const claimedRoot = claimed
      ? null
      : await db
          .insertInto("gooddollarClaimedRoots")
          .values({
            roundId: round.id,
            rootAddress,
            address: claimingAddress,
          })
          .onConflict((oc) =>
            oc.columns(["roundId", "rootAddress"]).doNothing(),
          )
          .returning(["id"])
          .executeTakeFirst();

    // Nothing inserted against a root the lookup said was free means a wallet
    // connected to the same identity claimed it in between, which the lookup
    // alone can't settle.
    if (!claimed && !claimedRoot) {
      return Response.json({
        success: false,
        alreadyClaimed: true,
        error: "This GoodDollar identity already voted from another wallet",
      });
    }

    // Record group membership. The UNIQUE(round_id, address) constraint means
    // an address already in any group on this council yields 0 inserted rows,
    // in which case we skip the onchain addVoter call entirely (single-group
    // membership: the existing group wins).
    const inserted = await db
      .insertInto("voterGroupMembers")
      .values({
        voterGroupId: goodDollarGroup.id,
        roundId: round.id,
        address: claimingAddress,
      })
      .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
      .returning(["id"])
      .executeTakeFirst();

    if (!inserted) {
      return Response.json({ success: true });
    }

    const { account, publicClient, walletClient } = getBotSigner(network);

    try {
      const hash = await sendBotTransaction(network, (nonce) =>
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

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });
    } catch (err) {
      const errorMessage =
        (err as Error)?.message ?? "There was an error, please try again later";

      // Already added onchain: the membership row is recorded, treat as success.
      if (errorMessage.includes("ALREADY_ADDED")) {
        return Response.json({ success: true });
      }

      // Roll back so a retry can re-attempt the onchain call. The claimed root
      // goes with it, but only when this request is what recorded it, else a
      // failed re-claim would release a slot another wallet is still holding.
      // Guard the rollback itself: if it throws, log it but still surface the
      // original onchain error below, rather than letting the rollback failure
      // propagate to the outer catch (which would lose the onchain error).
      try {
        await db
          .deleteFrom("voterGroupMembers")
          .where("id", "=", inserted.id)
          .execute();

        if (claimedRoot) {
          await db
            .deleteFrom("gooddollarClaimedRoots")
            .where("id", "=", claimedRoot.id)
            .execute();
        }
      } catch (rollbackErr) {
        console.error("Failed to roll back voter membership row:", rollbackErr);
      }

      // Contention on the shared bot key, not a chain failure: nothing was
      // broadcast and the membership row was just rolled back, so the claim is
      // cleanly retryable and says so with a status, as its sibling routes do.
      if (err instanceof ChainBusyError) {
        return Response.json(
          { success: false, error: "Too many requests, please retry later" },
          { status: 429 },
        );
      }

      // Log the raw error server-side only — RPC/contract errors can embed
      // provider URLs, contract addresses, or revert data, so never return the
      // message to the client.
      console.error(err);

      return Response.json({
        success: false,
        error: "There was an error, please try again later",
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    // Only errors before the onchain call reach here (JSON parse, address
    // validation, DB queries) — none produce ALREADY_ADDED, which the inner
    // catch around writeContract handles.
    console.error(err);

    return Response.json({
      success: false,
      error: "There was an error, please try again later",
    });
  }
}
