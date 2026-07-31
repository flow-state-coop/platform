import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Companion to task 16 of .claude/specs/flow-splitter-api-impl-plan.md.
//
//   GET /api/flow-splitter/status?chainId&poolId
//   no auth: the Share Register's API-controlled notice has to reach an admin
//   who has connected a wallet but not signed in

vi.hoisted(() => {
  process.env.METRICS_API_KEY_SECRET ??= "test-splitter-secret";
});

vi.mock("@/app/api/db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { GET as statusGet } from "./route";
import { getTestDb, resetDb } from "@tests/helpers/db";
import { resetRateLimits } from "@/app/api/rateLimit";
import {
  TEST_POOL_ID,
  TEST_SPLITTER_CHAIN_ID as CHAIN_ID,
} from "@tests/helpers/splitterChain";

const db = getTestDb();

function status(poolId: string = TEST_POOL_ID, chainId: number = CHAIN_ID) {
  return statusGet(
    new Request(
      `http://localhost/api/flow-splitter/status?chainId=${chainId}&poolId=${poolId}`,
    ),
  );
}

async function seedKey(revoked: boolean, poolId = TEST_POOL_ID) {
  await db
    .insertInto("splitterApiKeys")
    .values({
      chainId: CHAIN_ID,
      poolId,
      keyHash: `hash-${poolId}-${revoked}`,
      keyPrefix: "splitter_ab",
      label: "GoodBuilders metrics",
      revokedAt: revoked ? new Date() : null,
    })
    .execute();
}

beforeEach(async () => {
  await resetDb(db);
  resetRateLimits();
});

afterAll(async () => {
  await db.destroy();
});

describe("splitter API status", () => {
  it("reports no active keys for a pool that has never minted one", async () => {
    const res = await status();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, hasActiveKeys: false });
  });

  it("reports an active key without requiring a session", async () => {
    await seedKey(false);

    expect((await (await status()).json()).hasActiveKeys).toBe(true);
  });

  it("does not count a revoked key", async () => {
    await seedKey(true);

    expect((await (await status()).json()).hasActiveKeys).toBe(false);
  });

  it("scopes the answer to one pool", async () => {
    await seedKey(false, "43");

    expect((await (await status()).json()).hasActiveKeys).toBe(false);
  });

  // Canonicalized like every other splitter route, so "042" cannot report a
  // different answer from "42".
  it("canonicalizes the pool id", async () => {
    await seedKey(false);

    expect((await (await status("042")).json()).hasActiveKeys).toBe(true);
  });

  it("rejects a malformed pool id and an unknown chain", async () => {
    expect((await status("notanumber")).status).toBe(400);
    expect((await status(TEST_POOL_ID, 999999)).status).toBe(400);
    // 78 digits fit values past uint256 max, which used to surface as a 500
    // from the ABI encoder instead of a 400.
    expect((await status("9".repeat(78))).status).toBe(400);
  });

  // The only route here with no credential at all.
  it("refuses an origin looping past the request limit", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await status()).status).toBe(200);
    }

    expect((await status()).status).toBe(429);
  });

  // Nothing about a key itself is exposed: this is the whole response.
  it("never returns key material", async () => {
    await seedKey(false);

    const body = JSON.stringify(await (await status()).json());

    expect(body).not.toContain("splitter_ab");
    expect(body).not.toContain("GoodBuilders");
  });
});
