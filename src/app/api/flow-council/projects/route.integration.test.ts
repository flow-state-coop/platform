import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("../../../../../tests/helpers/db");
  return { db: getTestDb() };
});

import { GET, POST, PATCH } from "./route";
import {
  getTestDb,
  resetAndSeed,
  resetDb,
  TEST_MANAGER_ADDRESS,
  TEST_OTHER_MANAGER_ADDRESS,
  type SeededFixture,
} from "../../../../../tests/helpers/db";
import { mockSession, mockUnauthenticated } from "../../../../../tests/helpers/session";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";

const db = getTestDb();
const MIN_DESCRIPTION = "x".repeat(CHARACTER_LIMITS.projectDescription.min);

let fixture: SeededFixture;

beforeAll(async () => {
  fixture = await resetAndSeed(db);
});

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  fixture = await resetAndSeed(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

describe("GET /api/flow-council/projects", () => {
  it("returns 400-ish error when managerAddress is missing", async () => {
    const res = await GET(new Request("http://localhost/api/flow-council/projects"));
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Invalid manager address" });
  });

  it("rejects invalid address format", async () => {
    const res = await GET(
      new Request("http://localhost/api/flow-council/projects?managerAddress=notanaddress"),
    );
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("returns projects for a known manager", async () => {
    const res = await GET(
      new Request(
        `http://localhost/api/flow-council/projects?managerAddress=${TEST_MANAGER_ADDRESS}`,
      ),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].id).toBe(fixture.alphaProjectId);
  });

  it("returns empty array for an address with no projects", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/flow-council/projects?managerAddress=0x5555555555555555555555555555555555555555",
      ),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.projects).toEqual([]);
  });
});

describe("POST /api/flow-council/projects", () => {
  function postRequest(body: unknown) {
    return new Request("http://localhost/api/flow-council/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests", async () => {
    mockUnauthenticated();
    const res = await POST(postRequest({ name: "x", description: MIN_DESCRIPTION }));
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Unauthenticated" });
  });

  it("rejects payload failing validation", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(postRequest({ description: MIN_DESCRIPTION }));
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("creates a project for a valid payload", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(
      postRequest({
        name: "New Project",
        description: MIN_DESCRIPTION,
        managerAddresses: [TEST_MANAGER_ADDRESS],
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.project.id).toBeTypeOf("number");
  });

  it("rejects if caller's address is not in managerAddresses", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await POST(
      postRequest({
        name: "New Project",
        description: MIN_DESCRIPTION,
        managerAddresses: [TEST_OTHER_MANAGER_ADDRESS],
      }),
    );
    const body = await readJson(res);
    expect(body).toEqual({
      success: false,
      error: "Your address must be included as a manager",
    });
  });
});

describe("PATCH /api/flow-council/projects", () => {
  function patchRequest(body: unknown) {
    return new Request("http://localhost/api/flow-council/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests", async () => {
    mockUnauthenticated();
    const res = await PATCH(patchRequest({ projectId: fixture.alphaProjectId }));
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Unauthenticated" });
  });

  it("rejects missing projectId", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await PATCH(patchRequest({}));
    const body = await readJson(res);
    expect(body).toEqual({ success: false, error: "Project ID is required" });
  });

  it("rejects non-manager", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    // alpha is managed by TEST_MANAGER_ADDRESS; beta is not
    const res = await PATCH(patchRequest({ projectId: fixture.betaProjectId }));
    const body = await readJson(res);
    expect(body).toEqual({
      success: false,
      error: "Not authorized to update this project",
    });
  });

  it("updates the project when caller is the manager", async () => {
    mockSession(TEST_MANAGER_ADDRESS);
    const res = await PATCH(
      patchRequest({
        projectId: fixture.alphaProjectId,
        name: "Alpha Renamed",
        description: MIN_DESCRIPTION,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    const details =
      typeof body.project.details === "string"
        ? JSON.parse(body.project.details)
        : body.project.details;
    expect(details.name).toBe("Alpha Renamed");
  });
});
