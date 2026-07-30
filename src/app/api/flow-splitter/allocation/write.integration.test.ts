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
import { SUPERSEDED_ERROR } from "../jobs/runner";
import { resetTransferabilityCache } from "../pool";
import { hashApiKey } from "../../apiKeys";
import { getTestDb, resetDb } from "@tests/helpers/db";
import {
  mineStalledWrites,
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

/** The staleness window paces the retries, so a test has to skip past it. */
async function ageHeartbeat(jobId: string) {
  await db
    .updateTable("splitterWriteJobs")
    .set({ heartbeatAt: new Date(Date.now() - 10 * 60_000) })
    .where("id", "=", jobId)
    .execute();
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

  it("retires the abandoned job the new write took the slot from", async () => {
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
    await db
      .updateTable("splitterIntegrations")
      .set({ lastWriteAt: new Date(Date.now() - 10 * 60_000) })
      .execute();

    const second = await (await write([{ address: B, weight: 1 }])).json();
    await flushDeferred();

    const abandoned = await jobRow(first.jobId);
    expect(abandoned?.status).toBe("failed");
    expect(abandoned?.error).toMatch(/superseded/i);

    // The register is the newer job's, and polling the old one neither revives
    // it nor drags the pool back to the target it was chasing.
    await poll(first.jobId);
    await flushDeferred();

    expect(await jobRow(second.jobId).then((job) => job?.status)).toBe(
      "succeeded",
    );
    expect(splitterChain.units.get(B)).toBe(1_000_000n);
    expect(splitterChain.units.get(A) ?? 0n).toBe(0n);
  });

  // Losing the claim is the only thing that stops a runner. Without it a job the
  // pool has moved past keeps driving the register toward its own target, and
  // the winner's batches are undone by a job that cannot even record what it
  // spent the gas on.
  it("stops a runner the pool moved past between batches", async () => {
    await seedKey();
    const recipients = Array.from({ length: 60 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      weight: i + 1,
    }));

    const body = await (await write(recipients)).json();

    // What a newer write's supersession does to the row, applied while the job
    // is between its two batches.
    splitterChain.writeHook = async () => {
      splitterChain.writeHook = null;
      await db
        .updateTable("splitterWriteJobs")
        .set({ status: "failed", error: SUPERSEDED_ERROR })
        .where("id", "=", body.jobId)
        .execute();
    };

    await flushDeferred();

    expect(splitterChain.writes).toHaveLength(1);
    const job = await jobRow(body.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe(SUPERSEDED_ERROR);
  });

  // `supersedeJobs` is best-effort and its write still answers 202, so the
  // claim guard cannot depend on the retirement having landed.
  it("refuses an older job once the newer one has finished, and retires it", async () => {
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
    await db
      .updateTable("splitterIntegrations")
      .set({ lastWriteAt: new Date(Date.now() - 10 * 60_000) })
      .execute();

    const second = await (await write([{ address: B, weight: 1 }])).json();
    await flushDeferred();
    expect((await jobRow(second.jobId))?.status).toBe("succeeded");

    // A retirement that never landed leaves the old job open next to a
    // successor that is already terminal.
    await db
      .updateTable("splitterWriteJobs")
      .set({
        status: "running",
        error: null,
        heartbeatAt: new Date(Date.now() - 10 * 60_000),
      })
      .where("id", "=", first.jobId)
      .execute();
    splitterChain.writes = [];

    await poll(first.jobId);
    await flushDeferred();

    expect(splitterChain.writes).toHaveLength(0);
    expect(splitterChain.units.get(B)).toBe(1_000_000n);
    expect(splitterChain.units.get(A) ?? 0n).toBe(0n);

    // Reported rather than left running, or the caller's poll loop never ends.
    const retired = await jobRow(first.jobId);
    expect(retired?.status).toBe("failed");
    expect(retired?.error).toMatch(/superseded/i);
  });

  // A receipt that never arrives usually means the transaction is still in the
  // mempool. Re-sending its batch would put a second one on the wire at the next
  // nonce, and when the stall clears both mine and both are paid for.
  it("waits out a pending transaction instead of broadcasting the batch again", async () => {
    await seedKey();
    splitterChain.stallWriteNumber = 1;

    const body = await (await write([{ address: A, weight: 1 }])).json();
    await flushDeferred();

    expect(splitterChain.writes).toHaveLength(1);
    expect((await jobRow(body.jobId))?.status).toBe("running");
    expect((await jobRow(body.jobId))?.txHashes).toHaveLength(1);

    await ageHeartbeat(body.jobId);
    await poll(body.jobId);
    await flushDeferred();

    expect(splitterChain.writes).toHaveLength(1);

    // Once it mines, the resumed job absorbs it rather than repeating it.
    mineStalledWrites();
    await ageHeartbeat(body.jobId);
    await poll(body.jobId);
    await flushDeferred();

    expect(splitterChain.writes).toHaveLength(1);
    expect(splitterChain.units.get(A)).toBe(1_000_000n);
    expect((await jobRow(body.jobId))?.status).toBe("succeeded");
  });

  it("says a broadcast was never confirmed rather than that nothing changed", async () => {
    await seedKey();
    splitterChain.stallWriteNumber = 1;

    const body = await (await write([{ address: A, weight: 1 }])).json();
    await flushDeferred();

    for (let i = 0; i < 5; i++) {
      await ageHeartbeat(body.jobId);
      await poll(body.jobId);
      await flushDeferred();
    }

    // The register may still change when the stall clears, so the caller needs
    // the repair instruction rather than a promise that nothing happened.
    const job = await jobRow(body.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("never confirmed");
    expect(job?.error).toContain("Re-submit the same payload");
  });

  it("refuses a write to a pool with more members than it can enumerate", async () => {
    await seedKey();
    splitterChain.oversizedMemberCount = 20_001;

    const res = await write([{ address: A, weight: 1 }]);

    // No retry can shrink the pool, so a 502 would have the caller loop forever
    // while the only actionable thing about the refusal sat in our logs.
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("more than 20000 members");

    const jobs = await db.selectFrom("splitterWriteJobs").selectAll().execute();
    expect(jobs).toHaveLength(0);
    expect(splitterChain.writes).toHaveLength(0);
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

  // Our RPC or indexer being down is the likeliest way a write fails, and it is
  // the one failure a retry can actually fix. Failing it at the first attempt
  // spends none of the retry budget on the thing the budget is for.
  it("keeps a job alive through an infrastructure failure and finishes it", async () => {
    await seedKey();
    splitterChain.writeError = "socket hang up";

    const body = await (await write([{ address: A, weight: 1 }])).json();
    await flushDeferred();

    const stalled = await jobRow(body.jobId);
    expect(stalled?.status).toBe("running");
    expect(stalled?.error).toBeNull();

    // The staleness window paces the retry, so age the job past it and poll,
    // which is the same recovery path a crashed runner takes.
    splitterChain.writeError = null;
    await db
      .updateTable("splitterWriteJobs")
      .set({ heartbeatAt: new Date(Date.now() - 10 * 60_000) })
      .where("id", "=", body.jobId)
      .execute();

    await poll(body.jobId);
    await flushDeferred();

    const job = await jobRow(body.jobId);
    expect(job?.status).toBe("succeeded");
    expect(splitterChain.units.get(A)).toBe(1_000_000n);
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

  it("fails a job that never wins the bot key, once its grace window is up", async () => {
    await seedKey();

    const { jobId } = await (await write([{ address: A, weight: 1 }])).json();

    splitterChain.chainBusy = true;
    await flushDeferred();

    // Contention is not the job's fault, so while it is young the attempt it
    // spent is handed back and it waits for the next poll.
    expect((await jobRow(jobId))?.status).toBe("queued");
    expect((await jobRow(jobId))?.attempt).toBe(0);
    expect(splitterChain.writes).toHaveLength(0);

    await db
      .updateTable("splitterWriteJobs")
      .set({ createdAt: new Date(Date.now() - 31 * 60_000) })
      .where("id", "=", jobId)
      .execute();

    // Past the grace window the attempts stand, so the job burns through them
    // and is reported rather than sitting queued until it expires.
    for (let i = 0; i < 6; i++) {
      await poll(jobId);
      await flushDeferred();
    }

    const job = await jobRow(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe(
      "The write did not complete after repeated attempts",
    );

    const body = await (await poll(jobId)).json();
    expect(body.job.status).toBe("failed");
  });

  it("spends the write window on a submission that changed nothing", async () => {
    await seedKey();
    setMember(A, 1_000_000n);

    const first = await (await write([{ address: A, weight: 1 }])).json();
    expect(first.status).toBe("no_change");

    // No transaction is sent, but resolving the register against the chain is
    // the expensive part and it already ran. Handing the window back would let
    // a loop resubmitting the current register drive that work, and a history
    // row, without limit.
    const second = await write([
      { address: A, weight: 1 },
      { address: B, weight: 1 },
    ]);
    expect(second.status).toBe(429);
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
