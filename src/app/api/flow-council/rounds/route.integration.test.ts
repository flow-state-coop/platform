import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: vi.fn() };
});

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { PATCH } from "./route";
import {
  getTestDb,
  resetDb,
  seedTestData,
  TEST_ADMIN_ADDRESS,
  TEST_OUTSIDER_ADDRESS,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
} from "@tests/helpers/db";
import { mockSession, mockUnauthenticated } from "@tests/helpers/session";

const db = getTestDb();

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  await seedTestData(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/rounds", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Spec: "Only round/pool admins may change the flag. For councils this is
//        enforced server-side via the existing SIWE admin check."
describe("PATCH /api/flow-council/rounds — listed flag", () => {
  const basePayload = {
    chainId: TEST_CHAIN_ID,
    flowCouncilAddress: TEST_COUNCIL_ADDRESS,
    name: "Test Round",
    description: "A test round",
  };

  it("rejects unauthenticated requests", async () => {
    mockUnauthenticated();
    const res = await PATCH(patchRequest({ ...basePayload, listed: true }));
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthenticated");
  });

  it("rejects a non-admin from changing listed", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const res = await PATCH(patchRequest({ ...basePayload, listed: true }));
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  // Spec: "PATCH with listed:true stores listed in the details JSON"
  it("stores listed:true in rounds.details when admin sends listed:true", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(patchRequest({ ...basePayload, listed: true }));
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(true);
  });

  // Spec: "PATCH with listed:false updates it"
  it("stores listed:false in rounds.details when admin sends listed:false", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(patchRequest({ ...basePayload, listed: false }));
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(false);
  });

  // Spec: "a PATCH WITHOUT `listed` preserves the existing value (the merge
  //        must not drop it)"
  it("preserves an existing listed:true when a PATCH omits the listed field", async () => {
    // First, set listed:true
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(patchRequest({ ...basePayload, listed: true }));

    // Now PATCH without listed — should preserve it
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({ ...basePayload, name: "Updated Name" }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    // The existing listed:true must not have been clobbered
    expect(details.listed).toBe(true);
  });

  // Spec: "A Flow Council row whose `details` has no `listed` field reads as Unlisted"
  it("rounds with no listed field in details default to unlisted (listed absent means unlisted)", async () => {
    // The seed inserts a round with details: {} — no listed field
    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    // listed absent → unlisted (i.e. not true)
    expect(details.listed).not.toBe(true);
  });

  it("does not alter other fields in details when updating listed", async () => {
    // Set name and description first
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(
      patchRequest({
        ...basePayload,
        name: "My Round",
        description: "My desc",
      }),
    );

    // Now set listed:true
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(
      patchRequest({
        ...basePayload,
        name: "My Round",
        description: "My desc",
        listed: true,
      }),
    );

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(true);
    expect(details.name).toBe("My Round");
    expect(details.description).toBe("My desc");
  });
});
