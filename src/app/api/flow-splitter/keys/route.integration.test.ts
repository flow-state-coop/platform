import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Task 12 of .claude/specs/flow-splitter-api-impl-plan.md.
//
//   GET/POST/DELETE /api/flow-splitter/keys?chainId&poolId
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
import {
  GET as keysGet,
  POST as keysPost,
  DELETE as keysDelete,
} from "./route";
import { resetTransferabilityCache, resetPoolAdminCache } from "../pool";
import { resetRateLimits } from "@/app/api/rateLimit";
import { getTestDb, resetDb } from "@tests/helpers/db";
import {
  resetSplitterChain,
  splitterChain,
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

function mint(label = "GoodBuilders metrics", poolId = TEST_POOL_ID) {
  return keysPost(
    new Request("http://localhost/api/flow-splitter/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: CHAIN_ID, poolId, label }),
    }),
  );
}

function list(poolId = TEST_POOL_ID) {
  return keysGet(
    new Request(
      `http://localhost/api/flow-splitter/keys?chainId=${CHAIN_ID}&poolId=${poolId}`,
    ),
  );
}

function revoke(id: number, poolId = TEST_POOL_ID) {
  return keysDelete(
    new Request(
      `http://localhost/api/flow-splitter/keys?chainId=${CHAIN_ID}&poolId=${poolId}&id=${id}`,
      { method: "DELETE" },
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

describe("splitter key management", () => {
  it("returns the plaintext token exactly once", async () => {
    const body = await (await mint()).json();

    expect(body.success).toBe(true);
    expect(body.key.token).toMatch(/^splitter_/);

    const listed = await (await list()).json();

    expect(listed.keys).toHaveLength(1);
    // Neither the token nor its hash is ever retrievable again.
    expect(JSON.stringify(listed)).not.toContain(body.key.token);
    expect(listed.keys[0].keyPrefix).toBe(body.key.keyPrefix);
    expect(listed.keys[0]).not.toHaveProperty("keyHash");
  });

  it("refuses an unauthenticated caller", async () => {
    signedInAs(null);

    expect((await mint()).status).toBe(401);
    expect((await list()).status).toBe(401);
  });

  // Label and prefix are minter-chosen or opaque, so without this the remaining
  // admins cannot tell a co-admin's key from a legitimate integration's.
  it("records and lists the admin who minted a key", async () => {
    await mint();

    const listed = await (await list()).json();

    expect(listed.keys[0].createdBy).toBe(TEST_POOL_ADMIN.toLowerCase());
  });

  it("refuses a caller who is not a pool admin", async () => {
    signedInAs(OUTSIDER);

    expect((await mint()).status).toBe(403);
  });

  it("caps a pool at ten active keys and frees a slot on revoke", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await mint(`key ${i}`)).status).toBe(200);
    }

    const refused = await mint("one too many");
    const refusedBody = await refused.json();

    expect(refused.status).toBe(409);
    // Worded so a caller can tell this apart from a cooldown or a running job.
    expect(refusedBody.error).toContain("limit of 10 active keys");

    const listed = await (await list()).json();
    await revoke(listed.keys[0].id);

    expect((await mint("after revoke")).status).toBe(200);
  });

  it("refuses to revoke the same key twice", async () => {
    const body = await (await mint()).json();

    expect((await revoke(body.key.id)).status).toBe(200);
    expect((await revoke(body.key.id)).status).toBe(404);
  });

  it("keeps a pool's keys invisible to another pool", async () => {
    await mint("pool 42 key");

    const other = await (await list("43")).json();

    expect(other.keys).toHaveLength(0);
  });

  it("refuses a pool with no admins, which is permanently immutable", async () => {
    splitterChain.admins = [];

    const res = await mint();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("immutable");
  });

  it("refuses a pool with transferable units", async () => {
    splitterChain.transferable = true;

    const res = await mint();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("transferable units");
  });

  it("mints and lists keys before the bot has been granted admin", async () => {
    splitterChain.botIsAdmin = false;

    const body = await (await mint()).json();
    expect(body.success).toBe(true);

    const listed = await (await list()).json();
    expect(listed.keys).toHaveLength(1);
  });
});
