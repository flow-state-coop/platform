import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

// The authoritative recipient list comes from the subgraph via
// getApolloClient(...).query(...). Drive it with a per-test mutable holder.
const { apolloRecipientsRef } = vi.hoisted(() => ({
  apolloRecipientsRef: { current: [] as { account: string }[] },
}));
vi.mock("@/lib/apollo", () => ({
  getApolloClient: () => ({
    query: async () => ({
      data: { flowCouncil: { recipients: apolloRecipientsRef.current } },
    }),
  }),
}));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { GET } from "./route";
import {
  getTestDb,
  resetDb,
  seedTestData,
  TEST_OTHER_MANAGER_ADDRESS,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
  type SeededFixture,
} from "@tests/helpers/db";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";

const db = getTestDb();

const BASE = "http://localhost/api/flow-council/recipients";
const UNAPPLIED_RECIPIENT = "0x9999999999999999999999999999999999999999";

let fixture: SeededFixture;

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  fixture = await seedTestData(db);
  apolloRecipientsRef.current = [];
});

function get(chainId: string, councilId: string) {
  const url = new URL(BASE);
  url.searchParams.set("chainId", chainId);
  url.searchParams.set("councilId", councilId);
  return GET(new Request(url));
}

async function readRecipients(): Promise<
  { address: string; name: string | null }[]
> {
  const res = await get(String(TEST_CHAIN_ID), TEST_COUNCIL_ADDRESS);
  expect(res.status).toBe(200);
  return JSON.parse(await res.text()).recipients;
}

async function setProjectName(projectId: number, name: string) {
  await db
    .updateTable("projects")
    .set({
      details: JSON.stringify({
        name,
        description: "x".repeat(CHARACTER_LIMITS.projectDescription.min),
      }),
    })
    .where("id", "=", projectId)
    .execute();
}

describe("GET /api/flow-council/recipients", () => {
  it("rejects an unknown chain", async () => {
    const res = await get("999999", TEST_COUNCIL_ADDRESS);
    expect(res.status).toBe(400);
  });

  it("rejects a malformed council address", async () => {
    const res = await get(String(TEST_CHAIN_ID), "not-an-address");
    expect(res.status).toBe(400);
  });

  it("joins accepted application names onto on-chain recipients", async () => {
    apolloRecipientsRef.current = [{ account: TEST_OTHER_MANAGER_ADDRESS }];

    expect(await readRecipients()).toEqual([
      {
        address: TEST_OTHER_MANAGER_ADDRESS.toLowerCase(),
        name: "Project Beta",
      },
    ]);
  });

  it("trims whitespace stored on a legacy project name", async () => {
    await setProjectName(fixture.betaProjectId, "  Project Beta \n");
    apolloRecipientsRef.current = [{ account: TEST_OTHER_MANAGER_ADDRESS }];

    expect((await readRecipients())[0].name).toBe("Project Beta");
  });

  it("returns a null name for a whitespace-only project name", async () => {
    await setProjectName(fixture.betaProjectId, "   ");
    apolloRecipientsRef.current = [{ account: TEST_OTHER_MANAGER_ADDRESS }];

    expect((await readRecipients())[0].name).toBeNull();
  });

  it("returns a null name for a recipient with no accepted application", async () => {
    apolloRecipientsRef.current = [{ account: UNAPPLIED_RECIPIENT }];

    expect(await readRecipients()).toEqual([
      { address: UNAPPLIED_RECIPIENT, name: null },
    ]);
  });
});
