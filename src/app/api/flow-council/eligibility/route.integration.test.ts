import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Task 4 of .claude/specs/flow-splitter-api-impl-plan.md. The third consumer of
// the shared bot key, previously untested.
//
//   POST /api/flow-council/eligibility
//   body:    { address, chainId, councilId, signature, issuedAt }
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

vi.mock("next-auth/next");
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { privateKeyToAccount } from "viem/accounts";
import { POST as eligibilityPost } from "./route";
import { buildClaimMessage } from "@/app/flow-councils/lib/claimMessage";
import { CLAIM_SIGNATURE_TTL_MS } from "@/app/flow-councils/lib/constants";
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
import { mockSession, mockUnauthenticated } from "@tests/helpers/session";

const db = getTestDb();

// Claimant wallets are backed by real keys so the route's signature check runs
// genuine ECDSA, as it does for the EOAs that make up nearly every claimer.
const KEY_BY_ADDRESS = new Map<string, `0x${string}`>();

function wallet(privateKey: `0x${string}`): string {
  const account = privateKeyToAccount(privateKey);
  KEY_BY_ADDRESS.set(account.address.toLowerCase(), privateKey);
  return account.address.toLowerCase();
}

const CLAIMANT = wallet(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
// A wallet its holder connected to CLAIMANT's GoodDollar identity: verified,
// but only CLAIMANT answers true to isWhitelisted.
const CONNECTED_WALLET = wallet(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

let roundId: number;
let groupId: number;

function signClaim(signer: string, address: string, issuedAt: number) {
  return privateKeyToAccount(KEY_BY_ADDRESS.get(signer)!).signMessage({
    message: buildClaimMessage({
      chainId: TEST_CHAIN_ID,
      councilId: TEST_COUNCIL_ADDRESS,
      address,
      issuedAt,
    }),
  });
}

async function claim(
  address = CLAIMANT,
  { signer = address, issuedAt = Date.now(), sign = true } = {},
) {
  return eligibilityPost(
    new Request("http://localhost/api/flow-council/eligibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address,
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        issuedAt,
        signature: sign
          ? await signClaim(signer, address, issuedAt)
          : undefined,
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
  // The claim signature is the proof by default; the signed-in path is opted
  // into per test.
  mockUnauthenticated();
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
    const body = await (await claim()).json();

    expect(body).toEqual({ success: true });
    expect(botChain.writes).toHaveLength(1);
    expect(botChain.writes[0].functionName).toBe("addVoter");
    expect(botChain.writes[0].nonce).toBe(0);
    expect(await memberCount()).toBe(1);
    expect(await claimedRoots()).toEqual([
      { rootAddress: CLAIMANT, address: CLAIMANT },
    ]);
  });

  it("refuses a claim signed by another wallet", async () => {
    // Without this the caller picks which of a holder's connected wallets the
    // identity's single spot is burned on.
    const body = await (
      await claim(CLAIMANT, { signer: CONNECTED_WALLET })
    ).json();

    expect(body.success).toBe(false);
    // Named so the client can tell a signature it should re-sign from one it
    // never should.
    expect(body.reason).toBe("invalid_signature");
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(0);
    expect(await claimedRoots()).toEqual([]);
  });

  it("takes a signed-in wallet's session as its proof", async () => {
    // Connecting prompts for SIWE, so asking the same wallet to sign again
    // would be a second popup for nothing.
    mockSession(CLAIMANT);

    const body = await (await claim(CLAIMANT, { sign: false })).json();

    expect(body).toEqual({ success: true });
    expect(await memberCount()).toBe(1);
  });

  it("refuses an unsigned claim from a session belonging to another wallet", async () => {
    mockSession(CONNECTED_WALLET);

    const body = await (await claim(CLAIMANT, { sign: false })).json();

    expect(body.success).toBe(false);
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(0);
  });

  it("refuses an unsigned claim with no session at all", async () => {
    const body = await (await claim(CLAIMANT, { sign: false })).json();

    expect(body.success).toBe(false);
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(0);
  });

  it("refuses a signature older than its window", async () => {
    const body = await (
      await claim(CLAIMANT, {
        issuedAt: Date.now() - CLAIM_SIGNATURE_TTL_MS - 1,
      })
    ).json();

    expect(body.success).toBe(false);
    // The timestamp came from the claimer's clock, so signing again is what
    // answers it; the client needs to be told that apart from a bad signature.
    expect(body.reason).toBe("expired_signature");
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(0);
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

  it("rolls both rows back when addVoter mines and reverts", async () => {
    botChain.receiptStatus = "reverted";

    const body = await (await claim()).json();

    expect(body.success).toBe(false);
    // A revert is final, so the slot goes back and a retry can re-attempt it.
    expect(await memberCount()).toBe(0);
    expect(await claimedRoots()).toEqual([]);
  });

  it("keeps both rows when the receipt never arrives", async () => {
    botChain.receiptError = RPC_ERROR_MESSAGE;

    const body = await (await claim()).json();

    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain(RPC_ERROR_SENTINEL);
    // The transaction is broadcast and can still mine, so releasing the
    // identity here would hand a second connected wallet a second voter.
    expect(await memberCount()).toBe(1);
    expect(await claimedRoots()).toEqual([
      { rootAddress: CLAIMANT, address: CLAIMANT },
    ]);
  });

  it("refuses a connected wallet when the root votes with no claim recorded", async () => {
    // A council that enabled GoodDollar after CLAIMANT was already a voter:
    // nothing recorded the identity, so only the root voting here says so.
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: groupId, roundId, address: CLAIMANT })
      .execute();

    const body = await (await claim(CONNECTED_WALLET)).json();

    expect(body.success).toBe(false);
    expect(body.alreadyClaimed).toBe(true);
    expect(botChain.writes).toHaveLength(0);
    expect(await memberCount()).toBe(1);
  });

  it("skips the on-chain call when the wallet already votes on the council", async () => {
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: groupId, roundId, address: CLAIMANT })
      .execute();
    onRead("getVoter", ([account]) => ({
      account,
      votingPower: 10n,
      votes: [],
    }));

    const body = await (await claim()).json();

    expect(body).toEqual({ success: true });
    expect(botChain.writes).toHaveLength(0);
  });

  it("re-sends addVoter when the membership row has no voter behind it", async () => {
    // What an earlier attempt leaves behind when its broadcast is dropped: the
    // rows stay so the identity keeps its slot, and only the chain says the
    // voter never landed. Answering success on the row alone would confirm a
    // wallet that cannot vote, forever.
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: groupId, roundId, address: CLAIMANT })
      .execute();
    await db
      .insertInto("gooddollarClaimedRoots")
      .values({ roundId, rootAddress: CLAIMANT, address: CLAIMANT })
      .execute();
    onRead("getVoter", ([account]) => ({
      account,
      votingPower: 0n,
      votes: [],
    }));

    const body = await (await claim()).json();

    expect(body).toEqual({ success: true });
    expect(botChain.writes).toHaveLength(1);
    expect(botChain.writes[0].functionName).toBe("addVoter");
    expect(await memberCount()).toBe(1);
    expect(await claimedRoots()).toEqual([
      { rootAddress: CLAIMANT, address: CLAIMANT },
    ]);
  });
});
