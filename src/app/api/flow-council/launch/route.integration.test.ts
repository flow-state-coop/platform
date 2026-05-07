import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createPublicClient } from "viem";

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

import { POST } from "./route";
import {
  getTestDb,
  resetDb,
  TEST_ADMIN_ADDRESS,
  TEST_OUTSIDER_ADDRESS,
} from "@tests/helpers/db";
import { mockSession, mockUnauthenticated } from "@tests/helpers/session";
import { mockPublicClient } from "@tests/helpers/publicClient";

const db = getTestDb();

const NEW_COUNCIL_ADDRESS = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const VALID_SPLITTER_ADDRESS = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const OPTIMISM_CHAIN_ID = 10;
const OP_SEPOLIA_CHAIN_ID = 11155420;
const UNKNOWN_CHAIN_ID = 999_999;

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stubAdminRole(councilAddress: string, callerAddress: string, hasRole: boolean) {
  vi.mocked(createPublicClient).mockReturnValue(
    mockPublicClient([
      {
        address: councilAddress,
        functionName: "hasRole",
        args: [
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          callerAddress,
        ],
        returnValue: hasRole,
      },
    ]) as unknown as ReturnType<typeof createPublicClient>,
  );
}

describe("POST /api/flow-council/launch", () => {
  it("rejects unauthenticated requests", async () => {
    mockUnauthenticated();
    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        name: "Round",
      }),
    );
    expect(await readJson(res)).toEqual({
      success: false,
      error: "Unauthenticated",
    });
  });

  it("rejects unknown chainId", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: UNKNOWN_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        name: "Round",
      }),
    );
    expect(await readJson(res)).toEqual({
      success: false,
      error: "Invalid network",
    });
  });

  it("rejects malformed flowCouncilAddress", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: "not-an-address",
        name: "Round",
      }),
    );
    expect(await readJson(res)).toEqual({
      success: false,
      error: "Invalid flow council address",
    });
  });

  it("rejects caller without DEFAULT_ADMIN_ROLE", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    stubAdminRole(NEW_COUNCIL_ADDRESS, TEST_OUTSIDER_ADDRESS, false);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        name: "Round",
      }),
    );
    expect(await readJson(res)).toEqual({
      success: false,
      error: "Not an admin of this council",
    });
  });

  it("inserts a Celo-style round with no splitter address", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(NEW_COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        name: "Optimism Round",
        description: "test",
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.round.chainId).toBe(OPTIMISM_CHAIN_ID);
    expect(body.round.flowCouncilAddress).toBe(NEW_COUNCIL_ADDRESS);
    expect(body.round.superappSplitterAddress).toBeNull();

    const stored = await db
      .selectFrom("rounds")
      .select(["chainId", "flowCouncilAddress", "superappSplitterAddress"])
      .where("id", "=", body.round.id)
      .executeTakeFirstOrThrow();
    expect(stored.superappSplitterAddress).toBeNull();
  });

  it("persists a valid splitter address on OP Sepolia launch", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(NEW_COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OP_SEPOLIA_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        superappSplitterAddress: VALID_SPLITTER_ADDRESS,
        name: "OP Sepolia Round",
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.round.superappSplitterAddress).toBe(
      VALID_SPLITTER_ADDRESS.toLowerCase(),
    );

    const stored = await db
      .selectFrom("rounds")
      .select("superappSplitterAddress")
      .where("id", "=", body.round.id)
      .executeTakeFirstOrThrow();
    expect(stored.superappSplitterAddress).toBe(
      VALID_SPLITTER_ADDRESS.toLowerCase(),
    );
  });

  it("drops a malformed splitter address rather than persisting it", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(NEW_COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OP_SEPOLIA_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        superappSplitterAddress: "0xnot-an-address",
        name: "OP Sepolia Round",
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.round.superappSplitterAddress).toBeNull();
  });

  it("seeds the caller as a roundAdmin on success", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(NEW_COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: NEW_COUNCIL_ADDRESS,
        name: "Round",
      }),
    );
    const body = await readJson(res);

    const admins = await db
      .selectFrom("roundAdmins")
      .select("adminAddress")
      .where("roundId", "=", body.round.id)
      .execute();
    expect(admins.map((a) => a.adminAddress)).toContain(TEST_ADMIN_ADDRESS);
  });
});
