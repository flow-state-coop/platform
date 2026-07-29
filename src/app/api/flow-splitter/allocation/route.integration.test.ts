import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Task 14 of .claude/specs/flow-splitter-api-impl-plan.md.
//
//   GET /api/flow-splitter/allocation
//   auth: Authorization: Bearer <splitter key>
//   The pool comes from the key, never from a parameter.

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

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { GET as allocationGet } from "./route";
import { resetTransferabilityCache } from "../pool";
import { hashApiKey } from "../../apiKeys";
import { getTestDb, resetDb } from "@tests/helpers/db";
import {
  resetSplitterChain,
  setMember,
  setUnindexedMember,
  splitterChain,
  TEST_POOL_ADMIN,
  TEST_POOL_ID,
  TEST_SPLITTER_CHAIN_ID as CHAIN_ID,
} from "@tests/helpers/splitterChain";

const db = getTestDb();

const TOKEN = "splitter_read_token";
const A = "0x000000000000000000000000000000000000000a";
const B = "0x000000000000000000000000000000000000000b";
const C = "0x000000000000000000000000000000000000000c";

async function seedKey(token = TOKEN, poolId = TEST_POOL_ID) {
  const row = await db
    .insertInto("splitterApiKeys")
    .values({
      chainId: CHAIN_ID,
      poolId,
      keyHash: hashApiKey(token),
      keyPrefix: token.slice(0, 16),
      label: "read key",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

function read(token = TOKEN) {
  return allocationGet(
    new Request("http://localhost/api/flow-splitter/allocation", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

beforeEach(async () => {
  await resetDb(db);
  resetSplitterChain();
  resetTransferabilityCache();
});

afterAll(async () => {
  await db.destroy();
});

describe("splitter allocation read", () => {
  it("returns the register with percentages", async () => {
    await seedKey();
    setMember(A, 750_000n);
    setMember(B, 250_000n);

    const body = await (await read()).json();

    expect(body.success).toBe(true);
    expect(body.pool.poolId).toBe(TEST_POOL_ID);
    expect(body.totalUnits).toBe("1000000");
    expect(body.recipients).toEqual([
      { address: A, units: "750000", percentage: 75 },
      { address: B, units: "250000", percentage: 25 },
    ]);
    expect(
      body.recipients.reduce(
        (sum: number, r: { percentage: number }) => sum + r.percentage,
        0,
      ),
    ).toBeCloseTo(100, 4);
  });

  it("rejects an unknown token and a revoked one identically", async () => {
    const id = await seedKey();

    const unknown = await read("splitter_nope");
    expect(unknown.status).toBe(401);

    await db
      .updateTable("splitterApiKeys")
      .set({ revokedAt: new Date() })
      .where("id", "=", id)
      .execute();

    const revoked = await read();
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toEqual(await unknown.json());
  });

  it("rejects a request with no token", async () => {
    await seedKey();

    const res = await allocationGet(
      new Request("http://localhost/api/flow-splitter/allocation"),
    );

    expect(res.status).toBe(401);
  });

  it("serves only the pool the key belongs to", async () => {
    await seedKey("splitter_pool_43", "43");
    setMember(A, 1_000n);

    const body = await (await read("splitter_pool_43")).json();

    // The pool is derived from the key, so a key cannot be aimed elsewhere.
    expect(body.pool.poolId).toBe("43");
  });

  it("includes an on-chain recipient the indexer has not caught up to", async () => {
    await seedKey();
    setMember(A, 500_000n);
    // Written by the platform moments ago, so it is in the mirror but not yet
    // in the indexer's member list.
    setUnindexedMember(C, 500_000n);
    await db
      .insertInto("splitterWrittenRegister")
      .values({
        chainId: CHAIN_ID,
        poolId: TEST_POOL_ID,
        address: C,
        units: "500000",
      })
      .execute();

    const body = await (await read()).json();

    expect(body.recipients.map((r: { address: string }) => r.address)).toEqual([
      A,
      C,
    ]);
  });

  it("returns an empty register when every member holds zero", async () => {
    await seedKey();
    setMember(A, 0n);

    const body = await (await read()).json();

    expect(body.recipients).toEqual([]);
    expect(body.totalUnits).toBe("0");
  });

  it("refuses a pool that has become immutable", async () => {
    await seedKey();
    splitterChain.admins = [];

    const res = await read();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("immutable");
  });

  // A key is capability one admin handed out, so removing that admin on-chain
  // has to take it back. Otherwise a co-admin keeps a token that can redirect
  // the whole pool after they have been removed.
  it("refuses a key whose creator is no longer a pool admin", async () => {
    const id = await seedKey();
    await db
      .updateTable("splitterApiKeys")
      .set({ createdBy: TEST_POOL_ADMIN.toLowerCase() })
      .where("id", "=", id)
      .execute();

    expect((await read()).status).toBe(200);

    splitterChain.admins = ["0x000000000000000000000000000000000000dead"];

    const res = await read();

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("no longer an admin");
  });

  it("serves a key minted before creators were recorded", async () => {
    await seedKey();
    splitterChain.admins = ["0x000000000000000000000000000000000000dead"];

    expect((await read()).status).toBe(200);
  });

  it("refuses a key that is cooling down", async () => {
    const id = await seedKey();
    await db
      .updateTable("splitterApiKeys")
      .set({ cooldownUntil: new Date(Date.now() + 60_000) })
      .where("id", "=", id)
      .execute();

    const res = await read();

    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("cooling down");
  });

  it("records the key's last use", async () => {
    const id = await seedKey();
    setMember(A, 1_000n);

    await read();

    const row = await db
      .selectFrom("splitterApiKeys")
      .select(["lastUsedAt"])
      .where("id", "=", id)
      .executeTakeFirst();

    expect(row?.lastUsedAt).not.toBeNull();
  });
});
