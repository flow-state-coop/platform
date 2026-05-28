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
import { mockSession } from "@tests/helpers/session";
import { mockPublicClient } from "@tests/helpers/publicClient";

const db = getTestDb();

const COUNCIL_ADDRESS = "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const OPTIMISM_CHAIN_ID = 10;

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

function stubAdminRole(
  councilAddress: string,
  callerAddress: string,
  hasRole: boolean,
) {
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

// Spec: "Council flag persists on both POST (create) and edit"
// Spec: "POST /api/flow-council/launch with listed:true stores listed in the
//        details JSON"
describe("POST /api/flow-council/launch — listed flag", () => {
  it("stores listed:true in rounds.details when posted at creation", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: COUNCIL_ADDRESS,
        name: "Listed Round",
        listed: true,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("id", "=", body.round.id)
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(true);
  });

  it("stores listed:false in rounds.details when posted at creation with listed:false", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: COUNCIL_ADDRESS,
        name: "Unlisted Round",
        listed: false,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("id", "=", body.round.id)
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(false);
  });

  // Spec: "Default Unlisted for all existing and new rounds — missing/non-true = unlisted"
  it("new round without listed field in POST body defaults to no listed key (unlisted)", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    stubAdminRole(COUNCIL_ADDRESS, TEST_ADMIN_ADDRESS, true);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: COUNCIL_ADDRESS,
        name: "Default Round",
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("id", "=", body.round.id)
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    // listed absent or not true → unlisted
    expect(details.listed).not.toBe(true);
  });

  // Spec: "Only round/pool admins may change the flag"
  it("rejects non-admin from creating a listed round", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    stubAdminRole(COUNCIL_ADDRESS, TEST_OUTSIDER_ADDRESS, false);

    const res = await POST(
      postRequest({
        chainId: OPTIMISM_CHAIN_ID,
        flowCouncilAddress: COUNCIL_ADDRESS,
        name: "Listed Round",
        listed: true,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Not an admin of this council");
  });
});
