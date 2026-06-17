import { Address } from "viem";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import {
  FLOW_STATE_BOT_ADDRESS,
  METRICS_MIN_INTERVAL_MS,
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

export async function POST(request: Request) {
  // 1. Authenticate the Bearer API key (hash → indexed lookup). Revoked keys
  //    are treated as missing.
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!provided) return unauthorized();

  const keyRow = await db
    .selectFrom("metricsApiKeys")
    .select(["id", "roundId", "revokedAt"])
    .where("keyHash", "=", hashApiKey(provided))
    .executeTakeFirst();

  if (!keyRow || keyRow.revokedAt) return unauthorized();

  // 2. Resolve the council (chain + address) the key is scoped to.
  const round = await db
    .selectFrom("rounds")
    .select(["id", "chainId", "flowCouncilAddress"])
    .where("id", "=", keyRow.roundId)
    .executeTakeFirst();

  if (!round) return unauthorized();

  const network = networks.find((n) => n.id === round.chainId);
  if (!network) return errorResponse("Wrong network", 500);

  // 3. Parse and validate the body.
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

  // 4. The council must have a metrics group enabled.
  const group = await getMetricsGroup(round.id);
  if (!group) {
    return errorResponse("Metrics voting is not enabled for this council", 400);
  }

  // 5. Cheap rate-limit pre-check (avoids RPC work for hammered keys). The
  //    atomic claim in step 9 is the real guard against concurrent bursts.
  if (
    group.lastBallotAt &&
    Date.now() - new Date(group.lastBallotAt).getTime() <
      METRICS_MIN_INTERVAL_MS
  ) {
    return errorResponse("Too many ballots, please retry later", 429);
  }

  const council = round.flowCouncilAddress as Address;
  const { account, publicClient, walletClient } = getMetricsSigner(network);

  let claimed = false;
  let claimedAt: Date | null = null;

  try {
    // 6. Read the bot's current voting power, the council's spread limit, and
    //    the bot's current on-chain ballot in one round-trip.
    const [voter, maxVotingSpread, currentVotes] = await publicClient.multicall(
      {
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
          {
            address: council,
            abi: flowCouncilAbi,
            functionName: "getVotes",
            args: [FLOW_STATE_BOT_ADDRESS],
          },
        ],
      },
    );

    if (voter.votingPower === 0n) {
      return errorResponse(
        "The metrics voter has no voting power on this council",
        400,
      );
    }

    // 7. Normalize the weights to the bot's voting power under the spread cap.
    const target = normalizeWeightsToVotingPower(
      votes,
      voter.votingPower,
      Number(maxVotingSpread),
    );

    if (target.length === 0) {
      return errorResponse("No allocatable votes in ballot", 400);
    }

    // 8. Reject ballots referencing addresses that are not council recipients,
    //    rather than letting the on-chain call revert opaquely.
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
      return errorResponse(
        `Address ${unknown.recipient} is not a council recipient`,
        400,
      );
    }

    // 9. Skip the tx when the computed ballot already matches the on-chain one.
    const current: BallotVote[] = currentVotes.map((v) => ({
      recipient: v.recipient.toLowerCase() as `0x${string}`,
      amount: v.amount,
    }));
    if (votesEqual(target, current)) {
      await db
        .updateTable("metricsApiKeys")
        .set({ lastUsedAt: new Date() })
        .where("id", "=", keyRow.id)
        .execute();
      return Response.json({ success: true, skipped: true });
    }

    // 10. Atomically claim the rate-limit window. A lost claim means a
    //     concurrent submission won — reject so the bot's nonce isn't raced.
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

    // 11. Submit the ballot as the bot.
    const hash = await walletClient.writeContract({
      account,
      address: council,
      abi: flowCouncilAbi,
      functionName: "vote",
      args: [target.map((v) => ({ recipient: v.recipient, amount: v.amount }))],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    if (receipt.status !== "success") {
      throw new Error(`Ballot transaction reverted: ${hash}`);
    }

    await db
      .updateTable("metricsApiKeys")
      .set({ lastUsedAt: new Date() })
      .where("id", "=", keyRow.id)
      .execute();

    return Response.json({ success: true, txHash: hash });
  } catch (err) {
    // RPC/contract errors can embed provider URLs and revert data — log
    // server-side only, return a generic message.
    console.error(err);
    // No ballot landed, so release the rate-limit window claimed in step 10 —
    // otherwise a transient RPC error or revert locks the caller out for the
    // full interval.
    if (claimed && claimedAt) {
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
