import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Task 4 of .claude/specs/flow-splitter-api-impl-plan.md. The third consumer of
// the shared bot key, previously untested.
//
//   POST /api/flow-council/eligibility
//   body:    { address, chainId, councilId }
//   success: { success: true }
//   refusal: { success: false, error, notWhitelisted? | alreadyClaimed? }

vi.hoisted(() => {
  process.env.FLOW_STATE_ELIGIBILITY_PK ??=
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
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

import { POST as eligibilityPost } from "./route";
import {
  getTestDb,
  resetDb,
  seedTestData,
  TEST_CHAIN_ID,
  TEST_COUNCIL_ADDRESS,
} from "@tests/helpers/db";
import {
  botChain,
  onRead,
  resetBotChain,
  RPC_ERROR_MESSAGE,
  RPC_ERROR_SENTINEL,
} from "@tests/helpers/botChain";

const db = getTestDb();

const CLAIMANT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
// A wallet its holder connected to CLAIMANT's GoodDollar identity: verified,
// but only CLAIMANT answers true to isWhitelisted.
const CONNECTED_WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

let roundId: number;
let groupId: number;

function claim(address = CLAIMANT) {
  return eligibilityPost(
    new Request("http://localhost/api/flow-council/eligibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address,
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    }),
  );
}

async function memberCount(): Promise<number> {
  const rows = await db
    .selectFrom("voterGroupMembers")
    .select(["id"])
    .where("roundId", "=", roundId)
    .execute();
  return rows.length;
}

async function claimedRoots() {
  return db
    .selectFrom("gooddollarClaimedRoots")
    .select(["rootAddress", "address"])
    .where("roundId", "=", roundId)
    .execute();
}

beforeEach(async () => {
  await resetDb(db);
  resetBotChain();
  const seeded = await seedTestData(db);
  roundId = seeded.roundId;

  const group = await db
    .insertInto("voterGroups")
    .values({
      roundId,
      name: "GoodDollar",
      eligibilityMethod: "gooddollar",
      defaultVotingPower: 10,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  groupId = group.id;

  // Both wallets resolve to CLAIMANT, the root that carries the verification.
  onRead("getWhitelistedRoot", ([account]) =>
    String(account).toLowerCase() === CONNECTED_WALLET ? CLAIMANT : account,
  );
});

afterAll(async () => {
  await db.destroy();
});

describe("gooddollar eligibility self-claim", () => {
  it("adds the voter and carries an explicit nonce", async () => {
    const res = await eligibilityPost(
      new Request("http://localhost/api/flow-council/eligibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: CLAIMANT,
          chainId: TEST_CHAIN_ID,
          councilId: TEST_COUNCIL_ADDRESS,
        }),
      }),
    );
    const body = await res.json();

    expect(body).toEqual({ success: true });
    expect(botChain.writes).toHaveLength(1);
    expect(botChain.writes[0].functionName).toBe("addVoter");
    expect(botChain.writes[0].nonce).toBe(0);
    expect(await memberCount()).toBe(1);
    expect(await claimedRoots()).toEqual([
      { rootAddress: CLAIMANT, address: CLAIMANT },
    ]);
  });

  it("adds a wallet connected to a verified identity, not its root", async () => {
    const body = await (await claim(CONNECTED_WALLET)).json();

    expect(body).toEqual({ success: true });
    // The connected wallet signs the ballot, so it is what gets the power.
    expect(botChain.writes[0].args[0]).toBe(CONNECTED_WALLET);
    expect(await claimedRoots()).toEqual([
      { rootAddress: CLAIMANT, address: CONNECTED_WALLET },
    ]);
  });

  it("refuses a second wallet connected to an identity that already claimed", async () => {
    await claim();
    resetBotChain();
    onRead("getWhitelistedRoot", () => CLAIMANT);

    const body = await (await claim(CONNECTED_WALLET)).json();

    expect(body.success).toBe(false);
    expect(body.alreadyClaimed).toBe(true);
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(1);
  });

  it("sends nothing when the wallet belongs to no verified identity", async () => {
    onRead("getWhitelistedRoot", () => ZERO_ADDRESS);

    const body = await (await claim()).json();

    expect(body.success).toBe(false);
    expect(body.notWhitelisted).toBe(true);
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(0);
    expect(await claimedRoots()).toEqual([]);
  });

  it("treats an already-added voter as success and keeps the membership row", async () => {
    botChain.writeError = "execution reverted: ALREADY_ADDED";

    const body = await (await claim()).json();

    expect(body).toEqual({ success: true });
    expect(await memberCount()).toBe(1);
  });

  it("rolls the membership row back when the send fails", async () => {
    botChain.writeError = RPC_ERROR_MESSAGE;

    const body = await (await claim()).json();

    expect(body.success).toBe(false);
    // Provider detail must never reach the caller.
    expect(JSON.stringify(body)).not.toContain(RPC_ERROR_SENTINEL);
    // Rolled back so a retry can re-attempt the on-chain call.
    expect(await memberCount()).toBe(0);
    // Including the claim, else the identity is locked out with no voter.
    expect(await claimedRoots()).toEqual([]);
  });

  it("keeps the claim when a re-claim by the holding wallet fails to send", async () => {
    await claim();
    resetBotChain();
    onRead("getWhitelistedRoot", ([account]) => account);
    await db
      .deleteFrom("voterGroupMembers")
      .where("roundId", "=", roundId)
      .execute();
    botChain.writeError = RPC_ERROR_MESSAGE;

    const body = await (await claim()).json();

    expect(body.success).toBe(false);
    expect(await claimedRoots()).toEqual([
      { rootAddress: CLAIMANT, address: CLAIMANT },
    ]);
  });

  it("skips the on-chain call when the wallet is already a member", async () => {
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: groupId, roundId, address: CLAIMANT })
      .execute();

    const body = await (await claim()).json();

    expect(body).toEqual({ success: true });
    expect(botChain.writes).toHaveLength(0);
  });
});
