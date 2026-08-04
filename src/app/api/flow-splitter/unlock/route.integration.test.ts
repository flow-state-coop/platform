import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

//   POST /api/flow-splitter/unlock { chainId, poolId, txHash }
//   auth: SIWE session + on-chain pool admin, sender must match
//
// The claim verifies a one-time USDC payment on-chain and opens the write
// gate; the gate itself (402 on POST /allocation) is covered here too.

vi.hoisted(() => {
  process.env.METRICS_API_KEY_SECRET ??= "test-splitter-secret";
  process.env.FLOW_STATE_ELIGIBILITY_PK ??=
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  const { createSplitterMockPublicClient, createSplitterMockWalletClient } =
    await import("@tests/helpers/splitterChain");
  return {
    ...actual,
    createPublicClient: vi.fn(() => createSplitterMockPublicClient()),
    createWalletClient: vi.fn(() => createSplitterMockWalletClient()),
  };
});

vi.mock("@/lib/apollo", async () => {
  const { createSplitterMockApolloClient } = await import(
    "@tests/helpers/splitterChain"
  );
  const client = createSplitterMockApolloClient();
  return { getApolloClient: () => client };
});

// The write gate test only needs the 202; the job it defers never runs.
vi.mock("next/server", () => ({
  after: () => {},
}));

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { encodeEventTopics, erc20Abi, numberToHex, type Address } from "viem";
import { getServerSession } from "next-auth/next";
import { POST as unlockPost } from "./route";
import { GET as statusGet } from "../status/route";
import {
  GET as allocationGet,
  POST as allocationPost,
} from "../allocation/route";
import { resetTransferabilityCache, resetPoolAdminCache } from "../pool";
import { resetRateLimits } from "@/app/api/rateLimit";
import { hashApiKey } from "../../apiKeys";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import {
  SPLITTER_LOCKED_ERROR,
  SPLITTER_UNLOCK_PRICE,
  SPLITTER_UNLOCK_USDC,
  UNLOCK_TX_NOT_FOUND_ERROR,
  UNLOCK_TX_NOT_PAYMENT_ERROR,
  UNLOCK_TX_REVERTED_ERROR,
  UNLOCK_TX_USED_ERROR,
  UNLOCK_TX_WRONG_SENDER_ERROR,
} from "@/lib/splitterUnlock";
import { getTestDb, resetDb } from "@tests/helpers/db";
import {
  resetSplitterChain,
  splitterChain,
  TEST_POOL_ADMIN,
  TEST_POOL_ID,
  TEST_SPLITTER_CHAIN_ID as CHAIN_ID,
} from "@tests/helpers/splitterChain";

const db = getTestDb();

const USDC = SPLITTER_UNLOCK_USDC[CHAIN_ID];
const OUTSIDER = "0x9999999999999999999999999999999999999999";
const PAY_TX = `0x${"aa".repeat(32)}`;
const TOKEN = "splitter_unlock_test_token";
const RECIPIENT = "0x000000000000000000000000000000000000000a";
const FREE_CHAIN_ID = 11155420;

function signedInAs(address: string | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    address ? ({ address } as never) : null,
  );
}

function transferLog(token: Address, from: string, to: string, value: bigint) {
  return {
    address: token,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from: from as Address, to: to as Address },
    }),
    data: numberToHex(value, { size: 32 }),
  };
}

function payment({
  from = TEST_POOL_ADMIN,
  to = FLOW_STATE_BOT_ADDRESS as string,
  token = USDC,
  value = SPLITTER_UNLOCK_PRICE,
  status = "success",
  logs,
}: {
  from?: string;
  to?: string;
  token?: Address;
  value?: bigint;
  status?: string;
  logs?: unknown[];
} = {}) {
  return { status, from, logs: logs ?? [transferLog(token, from, to, value)] };
}

function claim(txHash = PAY_TX, poolId = TEST_POOL_ID, chainId = CHAIN_ID) {
  return unlockPost(
    new Request("http://localhost/api/flow-splitter/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, poolId, txHash }),
    }),
  );
}

async function seedKey(chainId = CHAIN_ID) {
  await db
    .insertInto("splitterApiKeys")
    .values({
      chainId,
      poolId: TEST_POOL_ID,
      keyHash: hashApiKey(TOKEN),
      keyPrefix: TOKEN.slice(0, 16),
      label: "unlock test key",
      createdBy: TEST_POOL_ADMIN.toLowerCase(),
    })
    .execute();
}

function write() {
  return allocationPost(
    new Request("http://localhost/api/flow-splitter/allocation", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ recipients: [{ address: RECIPIENT, weight: 1 }] }),
    }),
  );
}

function read() {
  return allocationGet(
    new Request("http://localhost/api/flow-splitter/allocation", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );
}

function status(chainId = CHAIN_ID) {
  return statusGet(
    new Request(
      `http://localhost/api/flow-splitter/status?chainId=${chainId}&poolId=${TEST_POOL_ID}`,
    ),
  );
}

beforeEach(async () => {
  await resetDb(db);
  resetSplitterChain();
  resetTransferabilityCache();
  resetPoolAdminCache();
  resetRateLimits();
  signedInAs(TEST_POOL_ADMIN);
});

afterAll(async () => {
  await db.destroy();
});

describe("splitter unlock", () => {
  it("refuses writes on a pool nobody paid for, and accepts them after the claim", async () => {
    await seedKey();

    const locked = await write();
    expect(locked.status).toBe(402);
    expect((await locked.json()).error).toBe(SPLITTER_LOCKED_ERROR);

    splitterChain.externalReceipts.set(PAY_TX, payment());
    const claimed = await claim();
    expect((await claimed.json()).unlocked).toBe(true);

    expect((await write()).status).toBe(202);
  });

  it("keeps reads open on a locked pool", async () => {
    await seedKey();

    const body = await (await read()).json();

    expect(body.success).toBe(true);
  });

  it("reports the unlock in the unauthenticated status", async () => {
    expect((await (await status()).json()).unlocked).toBe(false);

    splitterChain.externalReceipts.set(PAY_TX, payment());
    await claim();

    expect((await (await status()).json()).unlocked).toBe(true);
  });

  it("refuses an unauthenticated caller and a non-admin", async () => {
    splitterChain.externalReceipts.set(PAY_TX, payment());

    signedInAs(null);
    expect((await claim()).status).toBe(401);

    signedInAs(OUTSIDER);
    expect((await claim()).status).toBe(403);
  });

  it("refuses a malformed transaction hash", async () => {
    const res = await claim("0x1234");

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid transaction hash");
  });

  it("tells an unconfirmed transaction apart from a bad one", async () => {
    const res = await claim();

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(UNLOCK_TX_NOT_FOUND_ERROR);
  });

  it("refuses a reverted transaction", async () => {
    splitterChain.externalReceipts.set(PAY_TX, payment({ status: "reverted" }));

    const res = await claim();

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(UNLOCK_TX_REVERTED_ERROR);
  });

  it("refuses a payment the signed-in admin neither sent nor funded", async () => {
    // A real payment, but claimed by an admin who did not send the transaction
    // and whose wallet none of the funds left: either binding would have let a
    // bystander race someone else's payment onto a different pool.
    splitterChain.externalReceipts.set(PAY_TX, payment({ from: OUTSIDER }));

    const res = await claim();

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(UNLOCK_TX_WRONG_SENDER_ERROR);
  });

  it("accepts a contract wallet's payment broadcast by an executor", async () => {
    // A Safe pays: the receipt's sender is the executor EOA, never the
    // signed-in admin, so the binding is the USDC leaving the admin's wallet.
    splitterChain.externalReceipts.set(
      PAY_TX,
      payment({
        from: OUTSIDER,
        logs: [
          transferLog(
            USDC,
            TEST_POOL_ADMIN,
            FLOW_STATE_BOT_ADDRESS,
            SPLITTER_UNLOCK_PRICE,
          ),
        ],
      }),
    );

    const claimed = await claim();
    expect((await claimed.json()).unlocked).toBe(true);

    const recorded = await db
      .selectFrom("splitterUnlockPayments")
      .select("payer")
      .executeTakeFirstOrThrow();
    expect(recorded.payer).toBe(TEST_POOL_ADMIN.toLowerCase());
  });

  it("calls a non-payment by a different sender a non-payment, not a wrong wallet", async () => {
    splitterChain.externalReceipts.set(
      PAY_TX,
      payment({ from: OUTSIDER, to: OUTSIDER }),
    );

    const res = await claim();

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(UNLOCK_TX_NOT_PAYMENT_ERROR);
  });

  it("refuses a transaction that is not a payment", async () => {
    const wrongToken = payment({
      token: "0x1111111111111111111111111111111111111111",
    });
    const wrongReceiver = payment({ to: OUTSIDER });
    const shortPayment = payment({ value: SPLITTER_UNLOCK_PRICE - 1n });

    for (const receipt of [wrongToken, wrongReceiver, shortPayment]) {
      splitterChain.externalReceipts.set(PAY_TX, receipt);

      const res = await claim();

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(UNLOCK_TX_NOT_PAYMENT_ERROR);
    }
  });

  it("accepts a payment split across several transfers", async () => {
    splitterChain.externalReceipts.set(
      PAY_TX,
      payment({
        logs: [
          transferLog(
            USDC,
            TEST_POOL_ADMIN,
            FLOW_STATE_BOT_ADDRESS,
            6_000_000n,
          ),
          transferLog(
            USDC,
            TEST_POOL_ADMIN,
            FLOW_STATE_BOT_ADDRESS,
            4_000_000n,
          ),
        ],
      }),
    );

    expect((await (await claim()).json()).unlocked).toBe(true);
  });

  it("answers a re-claim of the recorded transaction instead of refusing it", async () => {
    splitterChain.externalReceipts.set(PAY_TX, payment());

    await claim();
    const again = await claim();

    expect((await again.json()).unlocked).toBe(true);

    const payments = await db
      .selectFrom("splitterUnlockPayments")
      .select("id")
      .execute();
    expect(payments).toHaveLength(1);
  });

  it("records a second real payment on an already-unlocked pool", async () => {
    // Two tabs paying at once both send real transfers. The second claim
    // lands after the first unlocked the pool, and its money reached the bot
    // all the same, so it is verified and recorded rather than answered away
    // unread.
    const SECOND_TX = `0x${"bb".repeat(32)}`;
    splitterChain.externalReceipts.set(PAY_TX, payment());
    splitterChain.externalReceipts.set(SECOND_TX, payment());

    await claim();
    const second = await claim(SECOND_TX);

    expect((await second.json()).unlocked).toBe(true);

    const payments = await db
      .selectFrom("splitterUnlockPayments")
      .select("txHash")
      .execute();
    expect(payments.map((p) => p.txHash).sort()).toEqual([PAY_TX, SECOND_TX]);
  });

  it("never lets one payment unlock two pools, whatever the hash casing", async () => {
    splitterChain.externalReceipts.set(PAY_TX, payment());
    await claim();

    const other = await claim(PAY_TX, "43");
    expect(other.status).toBe(409);
    expect((await other.json()).error).toBe(UNLOCK_TX_USED_ERROR);

    const recased = await claim(PAY_TX.toUpperCase().replace("0X", "0x"), "43");
    expect(recased.status).toBe(409);
  });

  it("records the payment for the audit trail", async () => {
    splitterChain.externalReceipts.set(PAY_TX, payment());
    await claim();

    const recorded = await db
      .selectFrom("splitterUnlockPayments")
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(recorded.chainId).toBe(CHAIN_ID);
    expect(recorded.poolId).toBe(TEST_POOL_ID);
    expect(recorded.txHash).toBe(PAY_TX);
    expect(recorded.payer).toBe(TEST_POOL_ADMIN.toLowerCase());
    expect(recorded.token).toBe(USDC.toLowerCase());
    expect(recorded.amount).toBe(SPLITTER_UNLOCK_PRICE.toString());
  });

  it("refuses an ineligible pool before taking money for it", async () => {
    splitterChain.externalReceipts.set(PAY_TX, payment());
    splitterChain.transferable = true;

    const res = await claim();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("transferable units");
  });

  it("does not gate the testnet, where there is nothing to pay with", async () => {
    await seedKey(FREE_CHAIN_ID);

    expect((await write()).status).toBe(202);
    expect((await (await status(FREE_CHAIN_ID)).json()).unlocked).toBe(true);

    // A claim on a free chain answers unlocked without reading any receipt.
    const claimed = await claim(PAY_TX, TEST_POOL_ID, FREE_CHAIN_ID);
    expect((await claimed.json()).unlocked).toBe(true);
  });
});
