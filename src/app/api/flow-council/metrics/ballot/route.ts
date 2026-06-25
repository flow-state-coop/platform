import { Address, zeroAddress } from "viem";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import {
  FLOW_STATE_BOT_ADDRESS,
  METRICS_MIN_INTERVAL_MS,
  METRICS_KEY_COOLDOWN_MS,
} from "@/app/flow-councils/lib/constants";
import { db } from "../../db";
import {
  errorResponse,
  readJsonBody,
  PayloadTooLargeError,
} from "../../../utils";
import { metricsBallotSchema } from "../../validation";
import { getMetricsGroup, getMetricsSigner, hashApiKey } from "../lib";
import {
  normalizeWeightsToVotingPower,
  votesEqual,
  type BallotVote,
} from "../normalize";

export const dynamic = "force-dynamic";

// 1000 entries × ~80 bytes plus JSON overhead.
const MAX_BODY_SIZE = 256 * 1024;

function unauthorized() {
  return errorResponse("Unauthorized", 401);
}

// Per-key backpressure after a request the caller could have avoided: a ballot
// whose content is deterministically bad (an unknown recipient, or weights that
// normalize to nothing) gets the key throttled, while the group's atomic claim
// stays the real guard against double submissions. Reserved for caller-content
// faults: transient/infra failures and config states never call this, so a
// healthy integration is never penalized. Best-effort, so a write failure is
// logged and ignored rather than blocking the response.
async function coolDownKey(keyId: number) {
  await db
    .updateTable("metricsApiKeys")
    .set({ cooldownUntil: new Date(Date.now() + METRICS_KEY_COOLDOWN_MS) })
    .where("id", "=", keyId)
    .execute()
    .catch((err) => console.error(err));
}

export async function POST(request: Request) {
  // Revoked keys are treated as missing.
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!provided) return unauthorized();

  const keyRow = await db
    .selectFrom("metricsApiKeys")
    .select(["id", "roundId", "revokedAt", "cooldownUntil"])
    .where("keyHash", "=", hashApiKey(provided))
    .executeTakeFirst();

  if (!keyRow || keyRow.revokedAt) return unauthorized();

  // Reject before any RPC work if this key is still cooling down from a prior
  // failed request. Distinct message from the group-level rate limit so the
  // caller can tell a key cooldown (their last ballot was rejected) apart from
  // another submission winning the shared window.
  if (keyRow.cooldownUntil && new Date(keyRow.cooldownUntil) > new Date()) {
    return errorResponse(
      "This API key is cooling down after a recently rejected ballot, please retry later",
      429,
    );
  }

  const round = await db
    .selectFrom("rounds")
    .select(["id", "chainId", "flowCouncilAddress"])
    .where("id", "=", keyRow.roundId)
    .executeTakeFirst();

  if (!round) return unauthorized();

  const network = networks.find((n) => n.id === round.chainId);
  if (!network) return errorResponse("Wrong network", 500);

  let votes: { recipient: string; weight: number }[];
  try {
    const json = await readJsonBody(request, MAX_BODY_SIZE);
    const parsed = metricsBallotSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }
    votes = parsed.data.votes;
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return errorResponse(err.message, 413);
    }
    return errorResponse("Invalid request body", 400);
  }

  const group = await getMetricsGroup(round.id);
  if (!group) {
    return errorResponse("Metrics voting is not enabled for this council", 400);
  }

  // Cheap rate-limit pre-check (avoids RPC work for hammered keys); the atomic
  // claim below is the real guard against concurrent bursts.
  if (
    group.lastBallotAt &&
    Date.now() - new Date(group.lastBallotAt).getTime() <
      METRICS_MIN_INTERVAL_MS
  ) {
    return errorResponse("Too many ballots, please retry later", 429);
  }

  // Record activity for every request that passes rate-limiting and proceeds to
  // do work, so the management UI's "Last used" reflects an active key even when
  // its ballots fail validation or revert. Best-effort so it never fails the
  // request.
  await db
    .updateTable("metricsApiKeys")
    .set({ lastUsedAt: new Date() })
    .where("id", "=", keyRow.id)
    .execute()
    .catch((err) => console.error(err));

  const council = round.flowCouncilAddress as Address;
  const { account, publicClient, walletClient } = getMetricsSigner(network);

  let claimed = false;
  let claimedAt: Date | null = null;
  let broadcast = false;

  try {
    // Bot's voting power and the council's spread limit in a single round-trip.
    // The current ballot is reconstructed below from the voter's vote entries
    // instead of read via getVotes(): on councils whose recipients have churned,
    // the deployed getVotes() can revert (out-of-bounds while resolving a sparse
    // recipient history), which an allowFailure:false multicall would surface as
    // an opaque 502. getVoter().votes carries the same data keyed by recipientId,
    // and recipientById resolves each id to its address without that bug.
    const [voter, maxVotingSpread] = await publicClient.multicall({
      allowFailure: false,
      contracts: [
        {
          address: council,
          abi: flowCouncilAbi,
          functionName: "getVoter",
          args: [FLOW_STATE_BOT_ADDRESS],
        },
        {
          address: council,
          abi: flowCouncilAbi,
          functionName: "maxVotingSpread",
        },
      ],
    });

    if (voter.votingPower === 0n) {
      // A transient/config state (admin mid-edit, or just after a
      // delete/recreate), not the key misbehaving, so don't cool it down.
      return errorResponse(
        "The metrics voter has no voting power on this council",
        400,
      );
    }

    const target = normalizeWeightsToVotingPower(
      votes,
      voter.votingPower,
      Number(maxVotingSpread),
    );

    if (target.length === 0) {
      await coolDownKey(keyRow.id);
      return errorResponse("No allocatable votes in ballot", 400);
    }

    // Reconstruct the bot's current on-chain ballot from its vote entries,
    // mirroring getVotes() without its churned-recipient revert. Each entry is
    // keyed by recipientId; recipientById resolves it to the recipient address.
    // Only positive amounts on still-live recipients (account != 0) count, the
    // same filter getVotes() applies: vote() never prunes 0-amount entries, and a
    // removed recipient must be dropped (vote() reverts NOT_FOUND when zeroing
    // one, and the contract excludes it from totalVotes anyway). Resolved before
    // recipient validation so a stable, repeatedly-polled ballot can skip without
    // the per-target validation multicall below.
    const votedEntries = voter.votes.filter((v) => v.amount > 0n);
    const resolved =
      votedEntries.length > 0
        ? await publicClient.multicall({
            allowFailure: false,
            contracts: votedEntries.map((v) => ({
              address: council,
              abi: flowCouncilAbi,
              functionName: "recipientById" as const,
              args: [v.recipientId],
            })),
          })
        : [];
    const current: BallotVote[] = votedEntries
      .map((v, i) => ({ account: resolved[i][0], amount: v.amount }))
      .filter((v) => v.account !== zeroAddress)
      .map((v) => ({
        recipient: v.account.toLowerCase() as `0x${string}`,
        amount: v.amount,
      }));

    // Skip the tx when the computed ballot already matches the on-chain one.
    // Safe even if a recipient was since removed: the state already equals the
    // request, so nothing new is written; a ballot that drops that recipient
    // won't match and takes the validation + clear path below.
    if (votesEqual(target, current)) {
      return Response.json({ success: true, skipped: true });
    }

    // Reject ballots referencing addresses that are not council recipients,
    // rather than letting the on-chain call revert opaquely.
    const recipientIds = await publicClient.multicall({
      allowFailure: false,
      contracts: target.map((v) => ({
        address: council,
        abi: flowCouncilAbi,
        functionName: "recipientIdByAddress" as const,
        args: [v.recipient],
      })),
    });

    const unknown = target.find((_, i) => recipientIds[i] === 0n);
    if (unknown) {
      await coolDownKey(keyRow.id);
      return errorResponse(
        `Address ${unknown.recipient} is not a council recipient`,
        400,
      );
    }

    // vote() only updates recipients present in the array, so a previously-voted
    // recipient dropped from the new ballot keeps its on-chain amount and would
    // push totalVotes over votingPower (revert). Explicitly zero those out.
    const targetRecipients = new Set(target.map((v) => v.recipient));
    const cleared = current
      .filter((v) => !targetRecipients.has(v.recipient))
      .map((v) => ({ recipient: v.recipient, amount: 0n }));
    const submission = [...target, ...cleared];

    // Atomically claim the rate-limit window. A lost claim means a concurrent
    // submission won, so reject to keep the bot's nonce from being raced.
    claimedAt = new Date();
    const threshold = new Date(claimedAt.getTime() - METRICS_MIN_INTERVAL_MS);
    const claim = await db
      .updateTable("voterGroups")
      .set({ lastBallotAt: claimedAt })
      .where("id", "=", group.id)
      .where((eb) =>
        eb.or([
          eb("lastBallotAt", "is", null),
          eb("lastBallotAt", "<", threshold),
        ]),
      )
      .executeTakeFirst();

    if (claim.numUpdatedRows === 0n) {
      return errorResponse("Too many ballots, please retry later", 429);
    }
    claimed = true;

    const hash = await walletClient.writeContract({
      account,
      address: council,
      abi: flowCouncilAbi,
      functionName: "vote",
      args: [
        submission.map((v) => ({ recipient: v.recipient, amount: v.amount })),
      ],
    });
    broadcast = true;

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    if (receipt.status !== "success") {
      throw new Error(`Ballot transaction reverted: ${hash}`);
    }

    return Response.json({ success: true, txHash: hash });
  } catch (err) {
    // RPC/contract errors can embed provider URLs and revert data, so log
    // server-side only and return a generic message. These are infra or
    // chain-state failures (and the tx may still land), not the key
    // misbehaving, so the key is not cooled down here; the group's rate-limit
    // window still throttles retries.
    console.error(err);
    // Release the rate-limit window only if the tx was never broadcast (the
    // failure was in a read/claim step). Once broadcast, the tx may still land,
    // so keep the window held, otherwise a retry could submit a second ballot.
    if (claimed && claimedAt && !broadcast) {
      // Restore the pre-claim value, which is null on a council's first-ever
      // ballot; setting it back to null is intentional, not a missing value.
      await db
        .updateTable("voterGroups")
        .set({ lastBallotAt: group.lastBallotAt })
        .where("id", "=", group.id)
        .where("lastBallotAt", "=", claimedAt)
        .execute()
        .catch((resetErr) => console.error(resetErr));
    }
    return errorResponse("There was an error submitting the ballot", 502);
  }
}
