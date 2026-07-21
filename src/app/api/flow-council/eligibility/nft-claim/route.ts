import { Address, isAddress, type PublicClient } from "viem";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import { db } from "../../db";
import { findRoundByCouncil, isFactoryCouncil } from "../../auth";
import { getBotSigner, loadNftRequirements } from "../../bot";
import { getCouncilPublicClient } from "../../metrics/lib";
import {
  claimRateWindow,
  releaseRateWindow,
  verifyClaimSignature,
} from "../claimGuards";
import {
  evaluateNftRequirements,
  selectWinner,
  toRequirements,
} from "../nftRequirements";

export const dynamic = "force-dynamic";

// Without a cap, gas estimation hands an admin-supplied contract the whole
// block limit at the bot's expense.
const ADD_VOTER_GAS_LIMIT = 200_000n;

type RefusalCode =
  | "no_requirements"
  | "invalid_signature"
  | "expired_signature"
  | "not_eligible"
  | "check_unavailable"
  | "bot_missing_role"
  | "rate_limited"
  | "council_unverified"
  | "chain_error";

function refusal(code: RefusalCode, status = 200) {
  return Response.json({ success: false, code }, { status });
}

async function readLastClaimAt(roundId: number): Promise<Date | null> {
  const round = await db
    .selectFrom("rounds")
    .select("lastClaimAt")
    .where("id", "=", roundId)
    .executeTakeFirst();

  return round?.lastClaimAt ? new Date(round.lastClaimAt) : null;
}

export async function POST(request: Request) {
  let roundId: number | null = null;
  let previousLastClaimAt: Date | null = null;
  let claimedAt: Date | null = null;
  let broadcast = false;

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

    roundId = round.id;

    const requirements = toRequirements(await loadNftRequirements(round.id));

    if (requirements.length === 0) {
      return refusal("no_requirements");
    }

    // No signature-less branch exists on this route, by design.
    const verification = await verifyClaimSignature({
      client: getCouncilPublicClient(network) as PublicClient,
      chainId: numericChainId,
      councilId,
      address,
      issuedAt: Number(issuedAt),
      signature: typeof signature === "string" ? signature : "",
    });

    if (!verification.ok) {
      return refusal(verification.code);
    }

    const evaluation = await evaluateNftRequirements({
      network,
      councilId,
      address,
      requirements,
    });

    // A wallet that already has power is never touched, however it got there.
    if (evaluation.votingPower !== null && evaluation.votingPower > 0n) {
      return Response.json({
        success: true,
        alreadyVoter: true,
        code: "already_voter",
        votingPower: evaluation.votingPower.toString(),
      });
    }

    if (evaluation.botHasRole === false) {
      return refusal("bot_missing_role");
    }

    // multicall allows per-call failure, so the role read can come back unknown
    // while the balances resolve. Spending gas on a claim that would revert
    // NOT_VOTER_MANAGER is worse than asking the caller to retry.
    if (evaluation.botHasRole === null) {
      return refusal("check_unavailable");
    }

    if (!(await isFactoryCouncil(numericChainId, councilId))) {
      return refusal("council_unverified");
    }

    const winner = selectWinner(evaluation.rows, requirements);

    if (!winner) {
      // An unresolved row outranks a not-eligible verdict: a read failure must
      // never be presented to a holder as "you don't qualify".
      return refusal(
        evaluation.rows.some((row) => row.status === "unknown")
          ? "check_unavailable"
          : "not_eligible",
      );
    }

    // After consent and eligibility, so spam cannot lock out real claimers;
    // before the write, so two claims cannot race the bot's nonce.
    previousLastClaimAt = await readLastClaimAt(round.id);
    claimedAt = new Date();

    if (!(await claimRateWindow(round.id, claimedAt))) {
      claimedAt = null;
      return refusal("rate_limited", 429);
    }

    const { account, publicClient, walletClient } = getBotSigner(network);

    const claimant = address.toLowerCase();

    const inserted = await db
      .insertInto("voterGroupMembers")
      .values({
        voterGroupId: winner.id,
        roundId: round.id,
        address: claimant,
      })
      .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
      .returning(["id"])
      .executeTakeFirst();

    let movedRowId: number | null = null;
    let previousGroupId: number | null = null;

    if (!inserted) {
      // A row exists and on-chain power is 0, so this is a zeroed-out voter
      // claiming again. Move it rather than reporting success and granting
      // nothing.
      const existing = await db
        .selectFrom("voterGroupMembers")
        .select(["id", "voterGroupId"])
        .where("roundId", "=", round.id)
        .where("address", "=", claimant)
        .executeTakeFirst();

      if (!existing) {
        throw new Error("Membership row neither inserted nor found");
      }

      movedRowId = existing.id;
      previousGroupId = existing.voterGroupId;

      await db
        .updateTable("voterGroupMembers")
        .set({ voterGroupId: winner.id })
        .where("id", "=", existing.id)
        .execute();
    }

    // Guarded so a failing rollback cannot mask the chain error behind it.
    const rollbackMembership = async () => {
      try {
        if (inserted) {
          await db
            .deleteFrom("voterGroupMembers")
            .where("id", "=", inserted.id)
            .execute();
        } else if (movedRowId !== null && previousGroupId !== null) {
          await db
            .updateTable("voterGroupMembers")
            .set({ voterGroupId: previousGroupId })
            .where("id", "=", movedRowId)
            .execute();
        }
      } catch (rollbackErr) {
        console.error("Failed to roll back voter membership row:", rollbackErr);
      }
    };

    let reverted = false;

    try {
      const hash = await walletClient.writeContract({
        account,
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "addVoter",
        args: [address as Address, BigInt(winner.defaultVotingPower)],
        gas: ADD_VOTER_GAS_LIMIT,
      });

      broadcast = true;

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        reverted = true;
        throw new Error(`Claim transaction reverted: ${hash}`);
      }
    } catch (err) {
      const errorMessage = (err as Error)?.message ?? "";

      // The wallet was added between the getVoter read and this broadcast, so
      // the membership row is correct and the claim already happened.
      if (errorMessage.includes("ALREADY_ADDED")) {
        // Someone else set the power, so it is not ours to report.
        if (!broadcast) {
          await releaseRateWindow(round.id, previousLastClaimAt, claimedAt);
        }

        return Response.json({
          success: true,
          alreadyVoter: true,
          code: "already_voter",
          groupId: winner.id,
          groupName: winner.name,
        });
      }

      // Only roll back on a provably terminal failure. A broadcast whose
      // receipt never resolved may still land, and deleting the row then would
      // leave a voter holding votes with no record and no way to self-heal.
      if (!broadcast || reverted) {
        await rollbackMembership();
      }

      if (!broadcast) {
        await releaseRateWindow(round.id, previousLastClaimAt, claimedAt);
      }

      // RPC errors can embed provider URLs and revert data.
      console.error(err);

      return refusal("chain_error");
    }

    return Response.json({
      success: true,
      votingPower: winner.defaultVotingPower,
      groupId: winner.id,
      groupName: winner.name,
    });
  } catch (err) {
    console.error(err);

    if (roundId !== null && claimedAt && !broadcast) {
      await releaseRateWindow(roundId, previousLastClaimAt, claimedAt);
    }

    // 500, unlike the refusals above: those are expected outcomes, this is a
    // bug, and status-code monitoring is the only thing that separates them.
    return Response.json(
      {
        success: false,
        error: "There was an error, please try again later",
      },
      { status: 500 },
    );
  }
}
