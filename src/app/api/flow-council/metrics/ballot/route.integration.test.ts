import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Task 4 of .claude/specs/flow-splitter-api-impl-plan.md. The busiest consumer
// of the shared bot key had no coverage, so the sequencing fix would otherwise
// have landed blind on it.
//
//   POST /api/flow-council/metrics/ballot
//   auth:    Authorization: Bearer <metrics key>
//   body:    { votes: [{ recipient, weight }] }
//   success: { success: true, txHash } | { success: true, skipped: true }

vi.hoisted(() => {
  process.env.FLOW_STATE_ELIGIBILITY_PK ??=
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env.METRICS_API_KEY_SECRET ??= "test-metrics-secret";
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  const { createBotMockPublicClient, createBotMockWalletClient } = await import(
    "@tests/helpers/botChain"
  );
  return {
    ...actual,
    createPublicClient: vi.fn(() => createBotMockPublicClient()),
    createWalletClient: vi.fn(() => createBotMockWalletClient()),
  };
});

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { POST as ballotPost } from "./route";
import { hashApiKey } from "../lib";
import { getTestDb, resetDb, seedTestData } from "@tests/helpers/db";
import {
  botChain,
  onRead,
  resetBotChain,
  RPC_ERROR_MESSAGE,
  RPC_ERROR_SENTINEL,
  TX_HASH,
} from "@tests/helpers/botChain";

const db = getTestDb();

const TOKEN = "metrics_test_token";
const RECIPIENT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RECIPIENT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

let roundId: number;
let groupId: number;

async function seedMetricsKey() {
  const group = await db
    .insertInto("voterGroups")
    .values({
      roundId,
      name: "Metrics",
      eligibilityMethod: "metrics",
      defaultVotingPower: 100,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  groupId = group.id;

  await db
    .insertInto("metricsApiKeys")
    .values({
      roundId,
      voterGroupId: groupId,
      keyHash: hashApiKey(TOKEN),
      keyPrefix: TOKEN.slice(0, 16),
      label: "test key",
    })
    .execute();
}

function ballot(votes: { recipient: string; weight: number }[], token = TOKEN) {
  return ballotPost(
    new Request("http://localhost/api/flow-council/metrics/ballot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ votes }),
    }),
  );
}

/** The council surface the ballot route reads, with no current ballot cast. */
function stubCouncilReads(currentVotes: { id: bigint; amount: bigint }[] = []) {
  const idByAddress = new Map<string, bigint>([
    [RECIPIENT_A, 1n],
    [RECIPIENT_B, 2n],
  ]);
  const addressById = new Map<bigint, string>([
    [1n, RECIPIENT_A],
    [2n, RECIPIENT_B],
  ]);

  onRead("getVoter", () => ({
    votingPower: 100n,
    votes: currentVotes.map((v) => ({ recipientId: v.id, amount: v.amount })),
  }));
  onRead("maxVotingSpread", () => 0n);
  onRead("recipientById", (args) => [
    addressById.get(args[0] as bigint) ?? `0x${"00".repeat(20)}`,
  ]);
  onRead("recipientIdByAddress", (args) => {
    const addr = String(args[0] ?? "").toLowerCase();
    return idByAddress.get(addr) ?? 0n;
  });
}

async function lastBallotAt(): Promise<Date | null> {
  const row = await db
    .selectFrom("voterGroups")
    .select(["lastBallotAt"])
    .where("id", "=", groupId)
    .executeTakeFirst();
  return row?.lastBallotAt ?? null;
}

beforeEach(async () => {
  await resetDb(db);
  resetBotChain();
  const seeded = await seedTestData(db);
  roundId = seeded.roundId;
  await seedMetricsKey();
});

afterAll(async () => {
  await db.destroy();
});

describe("metrics ballot", () => {
  it("casts a ballot and carries an explicit nonce", async () => {
    stubCouncilReads();

    const res = await ballot([
      { recipient: RECIPIENT_A, weight: 1 },
      { recipient: RECIPIENT_B, weight: 1 },
    ]);
    const body = await res.json();

    expect(body).toEqual({ success: true, txHash: TX_HASH });
    expect(botChain.writes).toHaveLength(1);
    expect(botChain.writes[0].functionName).toBe("vote");
    // The whole point of the fix: the send no longer lets a load-balanced RPC
    // pick the number.
    expect(botChain.writes[0].nonce).toBe(0);
    expect(botChain.receiptWaits).toEqual([TX_HASH]);
  });

  it("skips the transaction when the on-chain ballot already matches", async () => {
    // 100 voting power split evenly is 50/50, which is what is already cast.
    stubCouncilReads([
      { id: 1n, amount: 50n },
      { id: 2n, amount: 50n },
    ]);

    const res = await ballot([
      { recipient: RECIPIENT_A, weight: 1 },
      { recipient: RECIPIENT_B, weight: 1 },
    ]);
    const body = await res.json();

    expect(body).toEqual({ success: true, skipped: true });
    expect(botChain.writes).toHaveLength(0);
    // A skip must not consume the rate-limit window either.
    expect(await lastBallotAt()).toBeNull();
  });

  it("releases the rate-limit window when nothing was broadcast", async () => {
    stubCouncilReads();
    botChain.writeError = RPC_ERROR_MESSAGE;

    const res = await ballot([{ recipient: RECIPIENT_A, weight: 1 }]);
    const body = await res.json();

    expect(res.status).toBe(502);
    // Provider URLs and revert data must never reach the caller.
    expect(JSON.stringify(body)).not.toContain(RPC_ERROR_SENTINEL);
    // The claim is restored to its pre-ballot null, so a retry is not blocked
    // by a ballot that never left.
    expect(await lastBallotAt()).toBeNull();
  });

  it("holds the rate-limit window once a transaction was broadcast", async () => {
    stubCouncilReads();
    botChain.receiptError = RPC_ERROR_MESSAGE;

    const res = await ballot([{ recipient: RECIPIENT_A, weight: 1 }]);

    expect(res.status).toBe(502);
    // The transaction may still land, so the window stays held rather than
    // letting a retry cast a second ballot.
    expect(await lastBallotAt()).not.toBeNull();
  });

  it("rejects an unknown token without touching the chain", async () => {
    stubCouncilReads();

    const res = await ballot([{ recipient: RECIPIENT_A, weight: 1 }], "nope");

    expect(res.status).toBe(401);
    expect(botChain.reads).toHaveLength(0);
    expect(botChain.writes).toHaveLength(0);
  });

  it("cools the key down after a ballot naming a non-recipient", async () => {
    stubCouncilReads();

    const unknownAddress = "0xcccccccccccccccccccccccccccccccccccccccc";
    const res = await ballot([{ recipient: unknownAddress, weight: 1 }]);

    expect(res.status).toBe(400);
    expect(botChain.writes).toHaveLength(0);

    const key = await db
      .selectFrom("metricsApiKeys")
      .select(["cooldownUntil"])
      .where("roundId", "=", roundId)
      .executeTakeFirst();
    expect(key?.cooldownUntil).not.toBeNull();
  });
});
