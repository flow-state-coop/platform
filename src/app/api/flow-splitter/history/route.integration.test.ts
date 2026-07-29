import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Task 22 of .claude/specs/flow-splitter-api-impl-plan.md.
//
//   GET /api/flow-splitter/history?chainId&poolId&limit&offset
//   auth: SIWE session + on-chain pool admin

vi.hoisted(() => {
  process.env.METRICS_API_KEY_SECRET ??= "test-splitter-secret";
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  const { createSplitterMockPublicClient } = await import(
    "@tests/helpers/splitterChain"
  );
  return {
    ...actual,
    createPublicClient: vi.fn(() => createSplitterMockPublicClient()),
  };
});

vi.mock("@/lib/apollo", async () => {
  const { createSplitterMockApolloClient } = await import(
    "@tests/helpers/splitterChain"
  );
  const client = createSplitterMockApolloClient();
  return { getApolloClient: () => client };
});

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { getServerSession } from "next-auth/next";
import { GET as historyGet } from "./route";
import { resetTransferabilityCache, resetPoolAdminCache } from "../pool";
import { resetRateLimits } from "@/app/api/rateLimit";
import { getTestDb, resetDb } from "@tests/helpers/db";
import {
  resetSplitterChain,
  TEST_POOL_ADMIN,
  TEST_POOL_ID,
  TEST_SPLITTER_CHAIN_ID as CHAIN_ID,
} from "@tests/helpers/splitterChain";

const db = getTestDb();
const OUTSIDER = "0x9999999999999999999999999999999999999999";

function signedInAs(address: string | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    address ? ({ address } as never) : null,
  );
}

function history(params = "") {
  return historyGet(
    new Request(
      `http://localhost/api/flow-splitter/history?chainId=${CHAIN_ID}&poolId=${TEST_POOL_ID}${params}`,
    ),
  );
}

async function seedKey(label: string) {
  const key = await db
    .insertInto("splitterApiKeys")
    .values({
      chainId: CHAIN_ID,
      poolId: TEST_POOL_ID,
      keyHash: `hash-${label}`,
      keyPrefix: "splitter_ab",
      label,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return key.id;
}

async function seedWrite(values: {
  keyId?: number;
  poolId?: string;
  status?: string;
  changedCount?: number;
  txHashes?: string[];
  gasCostWei?: string;
  createdAt: Date;
}) {
  await db
    .insertInto("splitterWriteHistory")
    .values({
      chainId: CHAIN_ID,
      poolId: values.poolId ?? TEST_POOL_ID,
      keyId: values.keyId ?? null,
      changedCount: values.changedCount ?? 0,
      status: values.status ?? "succeeded",
      txHashes: values.txHashes ?? [],
      gasCostWei: values.gasCostWei ?? null,
      createdAt: values.createdAt,
    })
    .execute();
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

describe("splitter write history", () => {
  it("returns a pool's writes newest first, with the minting key's label", async () => {
    const keyId = await seedKey("GoodBuilders metrics");

    await seedWrite({
      keyId,
      changedCount: 3,
      txHashes: ["0xolder"],
      gasCostWei: "21000",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await seedWrite({
      keyId,
      status: "no_change",
      createdAt: new Date("2026-01-02T00:00:00Z"),
    });

    const body = await (await history()).json();

    expect(body.success).toBe(true);
    expect(body.writes).toHaveLength(2);
    expect(body.writes[0].status).toBe("no_change");
    expect(body.writes[1].changedCount).toBe(3);
    expect(body.writes[1].txHashes).toEqual(["0xolder"]);
    expect(body.writes[1].gasCostWei).toBe("21000");
    expect(body.writes[0].keyLabel).toBe("GoodBuilders metrics");
    expect(body.hasMore).toBe(false);
  });

  it("keeps another pool's writes invisible", async () => {
    await seedWrite({
      poolId: "43",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const body = await (await history()).json();

    expect(body.writes).toHaveLength(0);
  });

  it("paginates by cursor, reporting whether another page exists", async () => {
    for (let i = 0; i < 12; i++) {
      await seedWrite({
        changedCount: i,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      });
    }

    const first = await (await history("&limit=10")).json();

    expect(first.writes).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    expect(first.writes[0].changedCount).toBe(11);

    const last = first.writes[9];
    const second = await (
      await history(
        `&limit=10&beforeId=${last.id}&beforeCreatedAt=${encodeURIComponent(last.createdAt)}`,
      )
    ).json();

    expect(second.writes).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(second.writes[0].changedCount).toBe(1);
  });

  // The reason for the cursor: an API-controlled pool takes a write a minute,
  // and an offset window would shift under the caller between pages.
  it("does not repeat a row when a write lands between pages", async () => {
    for (let i = 0; i < 12; i++) {
      await seedWrite({
        changedCount: i,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      });
    }

    const first = await (await history("&limit=10")).json();

    await seedWrite({
      changedCount: 99,
      createdAt: new Date(Date.UTC(2026, 1, 1)),
    });

    const last = first.writes[9];
    const second = await (
      await history(
        `&limit=10&beforeId=${last.id}&beforeCreatedAt=${encodeURIComponent(last.createdAt)}`,
      )
    ).json();

    const ids = first.writes
      .concat(second.writes)
      .map((write: { id: number }) => write.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  // Silently returning page one would be appended to page one by the client.
  it("rejects an unusable cursor rather than returning the newest page", async () => {
    await seedWrite({
      changedCount: 7,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect((await history("&beforeId=notanumber")).status).toBe(400);
    expect((await history("&beforeId=1")).status).toBe(400);
  });

  it("refuses an unauthenticated caller and a non-admin", async () => {
    expect((await history()).status).toBe(200);

    signedInAs(null);
    expect((await history()).status).toBe(401);

    signedInAs(OUTSIDER);
    expect((await history()).status).toBe(403);
  });

  // The work being protected is upstream, not the DB: an unlimited loop spends
  // subgraph and RPC quota shared with the wallet the bot broadcasts through.
  it("refuses a caller looping past the request limit", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await history()).status).toBe(200);
    }

    const refused = await history();

    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toContain("Too many requests");
  });

  it("limits per caller, not globally", async () => {
    for (let i = 0; i < 60; i++) {
      await history();
    }

    signedInAs(OUTSIDER);

    // Still refused, but on authorization rather than on the limit.
    expect((await history()).status).toBe(403);
  });

  it("rejects a malformed pool id", async () => {
    const res = await historyGet(
      new Request(
        `http://localhost/api/flow-splitter/history?chainId=${CHAIN_ID}&poolId=notanumber`,
      ),
    );

    expect(res.status).toBe(400);
  });
});
