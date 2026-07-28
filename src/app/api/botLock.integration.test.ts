import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { sql } from "kysely";

// Task 4 of .claude/specs/flow-splitter-api-impl-plan.md. These cover the
// mechanism the sequencing fix rests on: one broadcast at a time per chain, an
// explicit nonce that survives a lagging RPC, and a lease that frees itself
// when its holder dies.

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { withChainSend, ChainBusyError } from "./botLock";
import { getTestDb, resetDb } from "@tests/helpers/db";

const db = getTestDb();

const CHAIN_A = 10;
const CHAIN_B = 8453;

// A pending count that never moves, standing in for a load-balanced RPC that
// has not yet seen what we broadcast. Every nonce past the first therefore has
// to come from the ledger.
const stuckAtZero = async () => 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition never became true");
    await sleep(25);
  }
}

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("withChainSend lease", () => {
  it("serializes sends on one chain and advances the nonce past a lagging RPC", async () => {
    const events: string[] = [];
    const nonces: number[] = [];
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withChainSend(CHAIN_A, stuckAtZero, async (nonce) => {
      nonces.push(nonce);
      events.push("first:start");
      await firstHeld;
      events.push("first:end");
      return "0xfirst";
    });

    await waitFor(() => events.includes("first:start"));

    const second = withChainSend(CHAIN_A, stuckAtZero, async (nonce) => {
      nonces.push(nonce);
      events.push("second:start");
      return "0xsecond";
    });

    // The second send must still be waiting on the lease, not broadcasting
    // alongside the first.
    await sleep(600);
    expect(events).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
    expect(nonces).toEqual([0, 1]);
  });

  it("does not serialize sends on different chains", async () => {
    const started: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const onA = withChainSend(CHAIN_A, stuckAtZero, async () => {
      started.push("a");
      await held;
      return "0xa";
    });

    await waitFor(() => started.includes("a"));

    const onB = withChainSend(CHAIN_B, stuckAtZero, async () => {
      started.push("b");
      return "0xb";
    });

    // B proceeds while A is mid-broadcast: a council ballot on one chain is
    // never queued behind a splitter write on another.
    await waitFor(() => started.includes("b"));
    expect(started).toEqual(["a", "b"]);

    release();
    await Promise.all([onA, onB]);
  });

  it("releases the lease when a send throws, so the next send proceeds", async () => {
    await expect(
      withChainSend(CHAIN_A, stuckAtZero, async () => {
        throw new Error("broadcast rejected");
      }),
    ).rejects.toThrow("broadcast rejected");

    const nonce = await withChainSend(CHAIN_A, stuckAtZero, async (n) => n);

    // The failed broadcast consumed no nonce, so the next send reuses it
    // rather than gapping the key.
    expect(nonce).toBe(0);
  });

  it("reclaims a lease whose holder died without releasing it", async () => {
    await db
      .insertInto("botChainLocks")
      .values({
        chainId: CHAIN_A,
        holder: "dead-holder",
        acquiredAt: new Date(Date.now() - 10 * 60_000),
        expiresAt: new Date(Date.now() - 5 * 60_000),
      })
      .execute();

    const nonce = await withChainSend(CHAIN_A, stuckAtZero, async (n) => n);

    expect(nonce).toBe(0);
  });

  it("refuses to send when the lease cannot be acquired in time", async () => {
    await db
      .insertInto("botChainLocks")
      .values({
        chainId: CHAIN_A,
        holder: "live-holder",
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .execute();

    let broadcast = false;
    await expect(
      withChainSend(CHAIN_A, stuckAtZero, async () => {
        broadcast = true;
        return "0x";
      }),
    ).rejects.toBeInstanceOf(ChainBusyError);

    // Callers map this to a retry-later response, so it must never have
    // reached the chain.
    expect(broadcast).toBe(false);
  }, 25_000);

  it("does not let a stale holder release a lease someone else now holds", async () => {
    let releaseSlow!: () => void;
    const slowHeld = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const slow = withChainSend(CHAIN_A, stuckAtZero, async () => {
      await slowHeld;
      return "0xslow";
    });

    // Let the send take the lease before the row is handed to someone else.
    await sleep(200);

    // Expire the in-flight lease and hand the row to a new holder, exactly as
    // an expiry-driven takeover would.
    await sql`
      UPDATE bot_chain_locks
         SET holder = 'newer-holder', expires_at = now() + interval '10 minutes'
       WHERE chain_id = ${CHAIN_A}
    `.execute(db);

    releaseSlow();
    await slow;

    const row = await db
      .selectFrom("botChainLocks")
      .select(["holder"])
      .where("chainId", "=", CHAIN_A)
      .executeTakeFirst();

    expect(row?.holder).toBe("newer-holder");
  });

  it("records the broadcast nonce even if the lease was lost mid-send", async () => {
    await withChainSend(CHAIN_A, stuckAtZero, async (n) => n);

    const row = await db
      .selectFrom("botChainLocks")
      .select(["lastNonce"])
      .where("chainId", "=", CHAIN_A)
      .executeTakeFirst();

    // A broadcast consumes its nonce whether or not the lease survived, so the
    // ledger has to carry it regardless.
    expect(Number(row?.lastNonce)).toBe(0);
  });
});
