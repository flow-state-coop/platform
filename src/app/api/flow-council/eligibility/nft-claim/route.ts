import { Address, isAddress, type PublicClient } from "viem";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import { db } from "../../db";
import { findRoundByCouncil } from "../../auth";
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
  type NftRequirement,
} from "../nftRequirements";

export const dynamic = "force-dynamic";

type RefusalCode =
  | "no_requirements"
  | "invalid_signature"
  | "expired_signature"
  | "not_eligible"
  | "check_unavailable"
  | "bot_missing_role"
  | "rate_limited"
  | "chain_error";

type RequirementRecord = Awaited<
  ReturnType<typeof loadNftRequirements>
>[number];

function refusal(code: RefusalCode, status = 200) {
  return Response.json({ success: false, code }, { status });
}

function toRequirements(rows: RequirementRecord[]): NftRequirement[] {
  // A group with no contract address can never match anyone, and passing an
  // empty address into the multicall would fail the whole batch rather than one
  // row, so an incomplete config is dropped before the reads are built.
  return rows
    .filter((row) => !!row.nftContractAddress)
    .map((row) => ({
      id: row.id,
      name: row.name,
      defaultVotingPower: row.defaultVotingPower,
      nftContractAddress: row.nftContractAddress as string,
      nftTokenStandard:
        row.nftTokenStandard === "erc1155"
          ? ("erc1155" as const)
          : ("erc721" as const),
      nftTokenId: row.nftTokenId,
    }));
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
  // Sibling of the GoodDollar route rather than a mode on it: a council is
  // either GoodDollar-gated or NFT-gated, never both, so the two claim paths
  // never contend for the same council or the same rate-limit window.
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

    // Consent is unconditional: there is no signature-less branch on this
    // route, which is what makes "no votes without a signature from the
    // claiming address" structural rather than a matter of client behavior.
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

    // A wallet that already has power is never touched, however it got there:
    // no membership write, no transaction, no rate window consumed.
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

    // Taken after consent and eligibility are proven, so spam cannot lock real
    // claimers out of the window, and before the chain write, so two claims
    // cannot race the bot's nonce.
    previousLastClaimAt = await readLastClaimAt(round.id);
    claimedAt = new Date();

    if (!(await claimRateWindow(round.id, claimedAt))) {
      claimedAt = null;
      return refusal("rate_limited", 429);
    }

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
      // A row already exists and step 4 proved on-chain power is 0, so this is
      // a voter an admin zeroed out claiming again. Move the row into the
      // winning group rather than reporting success and granting nothing.
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

    // The two rollback shapes, one per branch above. Guarded so a failing
    // rollback is logged without masking the chain error that triggered it.
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

    const { account, publicClient, walletClient } = getBotSigner(network);

    try {
      const hash = await walletClient.writeContract({
        account,
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "addVoter",
        args: [address as Address, BigInt(winner.defaultVotingPower)],
      });

      broadcast = true;

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new Error(`Claim transaction reverted: ${hash}`);
      }
    } catch (err) {
      const errorMessage = (err as Error)?.message ?? "";

      // The wallet was added between the getVoter read and this broadcast, so
      // the membership row is correct and the claim already happened.
      if (errorMessage.includes("ALREADY_ADDED")) {
        return Response.json({
          success: true,
          votingPower: winner.defaultVotingPower,
          groupId: winner.id,
          groupName: winner.name,
        });
      }

      await rollbackMembership();

      // Once broadcast the transaction may still land, so the window stays held
      // and a retry cannot grant votes twice.
      if (!broadcast) {
        await releaseRateWindow(round.id, previousLastClaimAt, claimedAt);
      }

      // RPC and contract errors can embed provider URLs and revert data, so
      // they are logged server-side only and never returned to the client.
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

    return Response.json({
      success: false,
      error: "There was an error, please try again later",
    });
  }
}
