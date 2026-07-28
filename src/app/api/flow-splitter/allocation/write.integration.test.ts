import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Tasks 18, 20 and 21 of .claude/specs/flow-splitter-api-impl-plan.md: the
// asynchronous write, its job runner, and the recovery path.
//
//   POST /api/flow-splitter/allocation  -> 202 { jobId } | { status: "no_change" }
//   GET  /api/flow-splitter/jobs/{id}   -> status, and resumes a stalled job

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

// `after` defers work past the response in production; running it inline keeps
// the job's lifecycle observable in a test.
const { deferred } = vi.hoisted(() => ({ deferred: [] as (() => unknown)[] }));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    deferred.push(fn);
  },
}));

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { getServerSession } from "next-auth/next";
import { POST as writePost } from "./route";
import { GET as keysGet } from "../keys/route";
import { GET as jobGet } from "../jobs/[jobId]/route";
import { resetTransferabilityCache } from "../pool";
import { hashApiKey } from "../../apiKeys";
import { getTestDb, resetDb } from "@tests/helpers/db";
import {
  resetSplitterChain,
  setMember,
  splitterChain,
  TEST_POOL_ADDRESS,
  TEST_POOL_ADMIN,
  TEST_POOL_ID,
  TEST_SPLITTER_CHAIN_ID as CHAIN_ID,
} from "@tests/helpers/splitterChain";

const db = getTestDb();

const TOKEN = "splitter_write_token";
const A = "0x000000000000000000000000000000000000000a";
const B = "0x000000000000000000000000000000000000000b";
const C = "0x000000000000000000000000000000000000000c";

async function seedKey(token = TOKEN) {
  const row = await db
    .insertInto("splitterApiKeys")
    .values({
      chainId: CHAIN_ID,
      poolId: TEST_POOL_ID,
      keyHash: hashApiKey(token),
      keyPrefix: token.slice(0, 16),
      label: "write key",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

function write(
  recipients: { address: string; weight: number }[],
  token = TOKEN,
) {
  return writePost(
    new Request("http://localhost/api/flow-splitter/allocation", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ recipients }),
    }),
  );
}

function poll(jobId: string, token = TOKEN) {
  return jobGet(
    new Request(`http://localhost/api/flow-splitter/jobs/${jobId}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ jobId }) },
  );
}

/** Run whatever the route deferred, as the platform would after responding. */
async function flushDeferred() {
  while (deferred.length > 0) {
    await deferred.shift()!();
  }
}

async function jobRow(jobId: string) {
  return db
    .selectFrom("splitterWriteJobs")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirst();
}

beforeEach(async () => {
  await resetDb(db);
  resetSplitterChain();
  resetTransferabilityCache();
  deferred.length = 0;
  vi.mocked(getServerSession).mockResolvedValue({
    address: TEST_POOL_ADMIN,
  } as never);
});

afterAll(async () => {
  await db.destroy();
});

describe("splitter allocation write", () => {
  it("accepts a payload, runs the job, and lands the register on-chain", async () => {
    await seedKey();

    const res = await write([
      { address: A, weight: 3 },
      { address: B, weight: 1 },
    ]);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.jobId).toBeDefined();

    await flushDeferred();

    expect(splitterChain.units.get(A)).toBe(750_000n);
    expect(splitterChain.units.get(B)).toBe(250_000n);

    const job = await jobRow(body.jobId);
    expect(job?.status).toBe("succeeded");
    expect(job?.txHashes).toHaveLength(1);
  });

  it("sends nothing when the register already matches", async () => {
    await seedKey();
    setMember(A, 750_000n);
    setMember(B, 250_000n);

    const body = await (
      await write([
        { address: A, weight: 3 },
        { address: B, weight: 1 },
      ])
    ).json();

    expect(body.status).toBe("no_change");
    expect(splitterChain.writes).toHaveLength(0);

    const history = await db
      .selectFrom("splitterWriteHistory")
      .selectAll()
      .execute();
    // Shown as a no-change, not as a duplicate write.
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("no_change");
  });

  it("zeroes a recipient the new payload dropped", async () => {
    await seedKey();
    setMember(A, 500_000n);
    setMember(B, 500_000n);

    await write([{ address: A, weight: 1 }]);
    await flushDeferred();

    expect(splitterChain.units.get(B)).toBe(0n);
    expect(splitterChain.units.get(A)).toBe(1_000_000n);
  });

  it("rejects a second write while one is running, naming the running job", async () => {
    await seedKey();

    const first = await (await write([{ address: A, weight: 1 }])).json();

    // The first job is queued and heartbeating but has not run yet.
    const res = await write([{ address: B, weight: 1 }]);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.jobId).toBe(first.jobId);
    expect(body.payloadHash).toBe(first.payloadHash);
    // Worded distinctly from a cooldown and from the key cap.
    expect(body.error).toContain("already running");
  });

  it("does not let a job with a dead heartbeat block a new write", async () => {
    await seedKey();
    const first = await (await write([{ address: A, weight: 1 }])).json();
    deferred.length = 0;

    await db
      .updateTable("splitterWriteJobs")
      .set({
        status: "running",
        heartbeatAt: new Date(Date.now() - 10 * 60_000),
      })
      .where("id", "=", first.jobId)
      .execute();

    // Also clear the rate-limit window, which is a separate limit.
    await db
      .updateTable("splitterIntegrations")
      .set({ lastWriteAt: new Date(Date.now() - 10 * 60_000) })
      .execute();

    const res = await write([{ address: B, weight: 1 }]);

    // A crashed runner must not wedge the pool until someone edits the database.
    expect(res.status).toBe(202);
  });

  it("resumes a stalled job when its status is polled", async () => {
    await seedKey();
    const first = await (await write([{ address: A, weight: 1 }])).json();
    // Simulate the runner dying before it ever ran.
    deferred.length = 0;
    await db
      .updateTable("splitterWriteJobs")
      .set({
        status: "running",
        heartbeatAt: new Date(Date.now() - 10 * 60_000),
      })
      .where("id", "=", first.jobId)
      .execute();

    await poll(first.jobId);
    await flushDeferred();

    const job = await jobRow(first.jobId);
    expect(job?.status).toBe("succeeded");
    expect(splitterChain.units.get(A)).toBe(1_000_000n);
  });

  it("reports a partial write as failed, naming the transactions that landed", async () => {
    await seedKey();
    // 60 recipients is two batches; the second one reverts.
    const recipients = Array.from({ length: 60 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      weight: i + 1,
    }));
    splitterChain.failWriteNumber = 2;

    const body = await (await write(recipients)).json();
    await flushDeferred();

    const job = await jobRow(body.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.txHashes.length).toBeGreaterThanOrEqual(1);
    expect(job?.error).toContain("inconsistent");

    // The mirror holds what the first batch landed, so those addresses can
    // still be zeroed by a later write.
    const mirrored = await db
      .selectFrom("splitterWrittenRegister")
      .select(["address"])
      .execute();
    expect(mirrored.length).toBeGreaterThan(0);
  });

  it("repairs a partial write with fewer transactions on re-submission", async () => {
    await seedKey();
    const recipients = Array.from({ length: 60 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      weight: i + 1,
    }));

    splitterChain.failWriteNumber = 2;
    const first = await (await write(recipients)).json();
    await flushDeferred();
    const firstWrites = splitterChain.writes.length;

    splitterChain.failWriteNumber = 0;
    splitterChain.writes = [];
    await db
      .updateTable("splitterIntegrations")
      .set({ lastWriteAt: new Date(Date.now() - 10 * 60_000) })
      .execute();

    const second = await (await write(recipients)).json();
    await flushDeferred();

    expect(second.jobId).not.toBe(first.jobId);
    expect((await jobRow(second.jobId))?.status).toBe("succeeded");
    // The diff is recomputed rather than the original batches replayed.
    expect(splitterChain.writes.length).toBeLessThan(firstWrites);
  });

  it("refuses the write when the bot is not a pool admin", async () => {
    await seedKey();
    splitterChain.botIsAdmin = false;

    const res = await write([{ address: A, weight: 1 }]);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("not an admin");
    expect(splitterChain.writes).toHaveLength(0);
  });

  it("stops a running job when the bot loses admin between batches", async () => {
    await seedKey();
    const recipients = Array.from({ length: 60 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      weight: i + 1,
    }));
    splitterChain.writeHook = (n) => {
      if (n === 1) splitterChain.botIsAdmin = false;
    };

    const body = await (await write(recipients)).json();
    await flushDeferred();

    const job = await jobRow(body.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("not an admin");
    // Stopped at a batch boundary rather than burning gas on reverts.
    expect(splitterChain.writes).toHaveLength(1);
  });

  it("cools the key down after a deterministically bad payload", async () => {
    const id = await seedKey();

    const res = await write([{ address: "not-an-address", weight: 1 }]);
    expect(res.status).toBe(400);

    const key = await db
      .selectFrom("splitterApiKeys")
      .select(["cooldownUntil"])
      .where("id", "=", id)
      .executeTakeFirst();
    expect(key?.cooldownUntil).not.toBeNull();
  });

  it("rejects a payload whose weights are all zero", async () => {
    await seedKey();

    const res = await write([
      { address: A, weight: 0 },
      { address: B, weight: 0 },
    ]);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("positive weight");
  });

  it("keeps running a job whose key was revoked after it was accepted", async () => {
    const id = await seedKey();
    const body = await (await write([{ address: A, weight: 1 }])).json();

    await db
      .updateTable("splitterApiKeys")
      .set({ revokedAt: new Date() })
      .where("id", "=", id)
      .execute();

    await flushDeferred();

    // Revoking blocks new submissions; it does not cancel accepted work.
    expect((await jobRow(body.jobId))?.status).toBe("succeeded");
    expect(splitterChain.units.get(A)).toBe(1_000_000n);
  });

  it("rejects a payload naming the pool itself, before any transaction", async () => {
    const id = await seedKey();

    const res = await write([
      { address: A, weight: 1 },
      { address: TEST_POOL_ADDRESS, weight: 1 },
    ]);

    // Naming the pool reverts on-chain, which mid-job would surface as a
    // partial write with an inconsistent register.
    expect(res.status).toBe(400);
    expect(splitterChain.writes).toHaveLength(0);

    const key = await db
      .selectFrom("splitterApiKeys")
      .select(["cooldownUntil"])
      .where("id", "=", id)
      .executeTakeFirst();
    expect(key?.cooldownUntil).not.toBeNull();
  });

  it("does not spend the write window on a submission that changed nothing", async () => {
    await seedKey();
    setMember(A, 1_000_000n);

    const first = await (await write([{ address: A, weight: 1 }])).json();
    expect(first.status).toBe("no_change");

    // A no-change sends no transaction and has no completion to measure from,
    // so the next real write must not be blocked behind a 60s window.
    const second = await write([
      { address: A, weight: 1 },
      { address: B, weight: 1 },
    ]);
    expect(second.status).toBe(202);
  });

  it("treats a zero-padded pool id as the same pool", async () => {
    // Otherwise every per-pool limit is bypassable by re-spelling the id, and
    // the mirror splits across spellings.
    await db
      .insertInto("splitterApiKeys")
      .values({
        chainId: CHAIN_ID,
        poolId: TEST_POOL_ID,
        keyHash: hashApiKey("splitter_padded"),
        keyPrefix: "splitter_padded",
        label: "padded",
      })
      .execute();

    const res = await keysGet(
      new Request(
        `http://localhost/api/flow-splitter/keys?chainId=${CHAIN_ID}&poolId=0${TEST_POOL_ID}`,
      ),
    );
    const body = await res.json();

    expect(body.keys).toHaveLength(1);
  });

  it("hides another pool's job from a key that does not own it", async () => {
    await seedKey();
    const body = await (await write([{ address: C, weight: 1 }])).json();

    await db
      .updateTable("splitterWriteJobs")
      .set({ poolId: "999" })
      .where("id", "=", body.jobId)
      .execute();

    expect((await poll(body.jobId)).status).toBe(404);
  });
});
