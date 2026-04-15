import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("../../../../../tests/helpers/db");
  return { db: getTestDb() };
});

vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return {
    ...actual,
    hasOnChainRole: vi.fn().mockResolvedValue(false),
  };
});

import { POST, PUT } from "./route";
import { hasOnChainRole } from "../auth";
import {
  getTestDb,
  resetAndSeed,
  resetDb,
  TEST_MANAGER_ADDRESS,
  TEST_OTHER_MANAGER_ADDRESS,
  TEST_ADMIN_ADDRESS,
  TEST_OUTSIDER_ADDRESS,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
  type SeededFixture,
} from "../../../../../tests/helpers/db";
import { mockSession, mockUnauthenticated } from "../../../../../tests/helpers/session";

const db = getTestDb();

let fixture: SeededFixture;

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  vi.mocked(hasOnChainRole).mockResolvedValue(false);
  fixture = await resetAndSeed(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/applications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/flow-council/applications", () => {
  it("returns 401 without a session", async () => {
    mockUnauthenticated();
    const res = await POST(postRequest({
      chainId: TEST_CHAIN_ID,
      councilId: TEST_COUNCIL_ADDRESS,
    }));
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Unauthenticated" });
  });

  it("returns empty list when round does not exist", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: TEST_CHAIN_ID,
        councilId: "0x0000000000000000000000000000000000000099",
      }),
    );
    const body = await readJson(res);
    expect(body).toEqual({ success: true, applications: [] });
  });

  it("rejects invalid chainId", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: 999999,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Wrong network" });
  });

  it("rejects invalid councilId", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: TEST_CHAIN_ID,
        councilId: "notanaddress",
      }),
    );
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Invalid council ID" });
  });

  it("returns only own applications in list mode for a non-admin manager", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        mode: "list",
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].id).toBe(fixture.submittedApplicationId);
    // list mode strips the full details payload
    expect(body.applications[0]).not.toHaveProperty("details");
  });

  it("returns all applications with full details for an admin", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.applications.length).toBeGreaterThanOrEqual(3);
    expect(body.applications[0]).toHaveProperty("details");
    expect(body.applications[0]).toHaveProperty("managerAddresses");
  });

  it("returns empty list when caller manages no projects", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const res = await POST(
      postRequest({
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        mode: "list",
      }),
    );
    const body = await readJson(res);
    expect(body).toEqual({ success: true, applications: [] });
  });

  it("still calls hasOnChainRole to check on-chain admin status", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    await POST(
      postRequest({
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        mode: "list",
      }),
    );
    expect(hasOnChainRole).toHaveBeenCalled();
  });
});

describe("PUT /api/flow-council/applications", () => {
  it("returns 401 without a session", async () => {
    mockUnauthenticated();
    const res = await PUT(putRequest({}));
    expect(res.status).toBe(401);
  });

  it("rejects invalid projectId", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await PUT(
      putRequest({
        projectId: "not-a-number",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Invalid project ID" });
  });

  it("rejects invalid chainId", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await PUT(
      putRequest({
        projectId: fixture.alphaProjectId,
        chainId: 999999,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Wrong network" });
  });

  it("rejects when caller is not a manager of the project", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const res = await PUT(
      putRequest({
        projectId: fixture.alphaProjectId,
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the round does not exist", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await PUT(
      putRequest({
        projectId: fixture.alphaProjectId,
        chainId: TEST_CHAIN_ID,
        councilId: "0x0000000000000000000000000000000000000099",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("updates an existing application draft", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    // Seed round has no formSchema → not dynamic. Omit details so
    // validateRoundDetails (strict RoundDetails schema) is skipped.
    const res = await PUT(
      putRequest({
        projectId: fixture.alphaProjectId,
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.application.id).toBe(fixture.submittedApplicationId);
  });

  it("returns 409 when the application is ACCEPTED and editsUnlocked is false", async () => {
    mockSession(TEST_OTHER_MANAGER_ADDRESS);
    const res = await PUT(
      putRequest({
        projectId: fixture.betaProjectId,
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toMatch(/locked/i);
  });

  it("returns 409 when applications are closed and the application is new", async () => {
    // Close the round and delete any existing application for a fresh project
    await db
      .updateTable("rounds")
      .set({ applicationsClosed: true })
      .where("id", "=", fixture.roundId)
      .execute();

    // Create a new project with no existing application
    const newProject = await db
      .insertInto("projects")
      .values({
        details: JSON.stringify({
          name: "Fresh Project",
          description: "x".repeat(250),
        }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({
        projectId: newProject.id,
        managerAddress: TEST_MANAGER_ADDRESS,
      })
      .execute();

    mockSession(TEST_MANAGER_ADDRESS);
    const res = await PUT(
      putRequest({
        projectId: newProject.id,
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      }),
    );
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toMatch(/closed/i);
  });
});
