import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

// hasOnChainRole (in ../auth) builds a viem public client and calls readContract
// three times (one per role). Mock createPublicClient so the admin address
// passes the role check and everyone else fails. The role arg is args[0], the
// account is args[1]; any true result grants access.
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(
        async ({ args }: { args: [unknown, string] }) =>
          args[1].toLowerCase() ===
          "0x2222222222222222222222222222222222222222",
      ),
    })),
  };
});

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

// The GET lazy-migration reads the onchain voter list from the subgraph via
// getApolloClient(...).query(...). Drive it with a per-test mutable holder.
const { apolloVotersRef } = vi.hoisted(() => ({
  apolloVotersRef: {
    current: [] as { account: string; votingPower: string }[],
  },
}));
vi.mock("@/lib/apollo", () => ({
  getApolloClient: () => ({
    query: async () => ({
      data: { flowCouncil: { voters: apolloVotersRef.current } },
    }),
  }),
}));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import {
  GET as groupsGet,
  POST as groupsPost,
  PATCH as groupsPatch,
  DELETE as groupsDelete,
} from "./route";
import {
  POST as memberPost,
  PATCH as memberPatch,
  DELETE as memberDelete,
} from "./members/route";
import { GET as publicGet } from "./public/route";
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

const A1 = "0x1000000000000000000000000000000000000001";
const A2 = "0x1000000000000000000000000000000000000002";
const A3 = "0x1000000000000000000000000000000000000003";

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  await seedTestData(db);
  apolloVotersRef.current = [];
  mockSession(TEST_ADMIN_ADDRESS);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function jsonRequest(method: string, url: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const BASE = "http://localhost/api/flow-council/voter-groups";

async function roundId(): Promise<number> {
  const round = await db
    .selectFrom("rounds")
    .select("id")
    .where("chainId", "=", TEST_CHAIN_ID)
    .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
    .executeTakeFirstOrThrow();

  return round.id;
}

async function createGroup(
  name: string,
  eligibilityMethod: "manual" | "gooddollar" = "manual",
  defaultVotingPower = 10,
): Promise<number> {
  const rid = await roundId();
  const g = await db
    .insertInto("voterGroups")
    .values({ roundId: rid, name, eligibilityMethod, defaultVotingPower })
    .returning("id")
    .executeTakeFirstOrThrow();

  return g.id;
}

async function memberCount(groupId: number): Promise<number> {
  const row = await db
    .selectFrom("voterGroupMembers")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("voterGroupId", "=", groupId)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Group CRUD + authorization
// ---------------------------------------------------------------------------

describe("voter-groups group CRUD", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  it("rejects POST from an unauthenticated caller", async () => {
    mockUnauthenticated();
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Core",
        eligibilityMethod: "manual",
        defaultVotingPower: 10,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthenticated");
  });

  it("rejects POST from a non-manager (no onchain role)", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Core",
        eligibilityMethod: "manual",
        defaultVotingPower: 10,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("creates a group for an authorized manager", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Core contributors",
        eligibilityMethod: "manual",
        defaultVotingPower: 7,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(typeof body.id).toBe("number");

    const stored = await db
      .selectFrom("voterGroups")
      .selectAll()
      .where("id", "=", body.id)
      .executeTakeFirstOrThrow();
    expect(stored.name).toBe("Core contributors");
    expect(stored.eligibilityMethod).toBe("manual");
    expect(stored.defaultVotingPower).toBe(7);
  });

  it("returns 409 on a duplicate group name", async () => {
    await createGroup("Default");
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Default",
        eligibilityMethod: "manual",
        defaultVotingPower: 10,
      }),
    );
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("rejects an invalid eligibilityMethod via the schema", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Bad",
        eligibilityMethod: "nft",
        defaultVotingPower: 10,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("rejects a GoodDollar group on a non-Celo chain (400)", async () => {
    // base.chainId is TEST_CHAIN_ID (non-Celo), so the API guard rejects it
    // even though the schema accepts the "gooddollar" method.
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "GD",
        eligibilityMethod: "gooddollar",
        defaultVotingPower: 10,
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("PATCH renames a group", async () => {
    const id = await createGroup("Old name");
    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, { ...base, name: "New name" }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("voterGroups")
      .select("name")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(stored.name).toBe("New name");
  });
});

// ---------------------------------------------------------------------------
// Deletion guardrails: empty + at least one group remaining
// ---------------------------------------------------------------------------

describe("voter-groups deletion guardrails", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  it("refuses to delete a non-empty group (400)", async () => {
    const g1 = await createGroup("Group 1");
    await createGroup("Group 2");
    const rid = await roundId();
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: g1, roundId: rid, address: A1 })
      .execute();

    const res = await groupsDelete(
      jsonRequest("DELETE", `${BASE}?id=${g1}`, base),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("refuses to delete the last remaining group (400)", async () => {
    const only = await createGroup("Only group");
    const res = await groupsDelete(
      jsonRequest("DELETE", `${BASE}?id=${only}`, base),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("deletes an empty group when another remains", async () => {
    const g1 = await createGroup("Group 1");
    await createGroup("Group 2");
    const res = await groupsDelete(
      jsonRequest("DELETE", `${BASE}?id=${g1}`, base),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const remaining = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("id", "=", g1)
      .executeTakeFirst();
    expect(remaining).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Members: single-membership, batch, move, remove
// ---------------------------------------------------------------------------

const MEMBERS = "http://localhost/api/flow-council/voter-groups/members";

describe("voter-groups members", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  it("adds a member (stored lowercased) and reports inserted", async () => {
    const g = await createGroup("G");
    const res = await memberPost(
      jsonRequest("POST", MEMBERS, {
        ...base,
        groupId: g,
        address: A1,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.inserted).toBe(true);

    const row = await db
      .selectFrom("voterGroupMembers")
      .select("address")
      .where("voterGroupId", "=", g)
      .executeTakeFirstOrThrow();
    expect(row.address).toBe(A1.toLowerCase());
  });

  it("skips an address already in another group (single-membership)", async () => {
    const g1 = await createGroup("G1");
    const g2 = await createGroup("G2");
    await memberPost(
      jsonRequest("POST", MEMBERS, { ...base, groupId: g1, address: A1 }),
    );
    const res = await memberPost(
      jsonRequest("POST", MEMBERS, { ...base, groupId: g2, address: A1 }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.inserted).toBe(false);

    // Still only one row, still in g1.
    expect(await memberCount(g1)).toBe(1);
    expect(await memberCount(g2)).toBe(0);
  });

  it("bulk-adds a batch of addresses in one call", async () => {
    const g = await createGroup("G");
    const res = await memberPost(
      jsonRequest("POST", MEMBERS, {
        ...base,
        groupId: g,
        addresses: [A1, A2, A3, A1],
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.insertedCount).toBe(3);
    expect(await memberCount(g)).toBe(3);
  });

  it("moves a voter between groups without onchain effect", async () => {
    const g1 = await createGroup("G1");
    const g2 = await createGroup("G2");
    await memberPost(
      jsonRequest("POST", MEMBERS, { ...base, groupId: g1, address: A1 }),
    );

    const res = await memberPatch(
      jsonRequest("PATCH", MEMBERS, {
        ...base,
        address: A1,
        newGroupId: g2,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(await memberCount(g1)).toBe(0);
    expect(await memberCount(g2)).toBe(1);
  });

  it("batch-removes members from the DB", async () => {
    const g = await createGroup("G");
    await memberPost(
      jsonRequest("POST", MEMBERS, {
        ...base,
        groupId: g,
        addresses: [A1, A2, A3],
      }),
    );

    const res = await memberDelete(
      jsonRequest("DELETE", MEMBERS, { ...base, addresses: [A1, A2] }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(await memberCount(g)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

describe("voter-groups public API", () => {
  it("returns group name → member addresses for a council", async () => {
    const g = await createGroup("Holders", "gooddollar", 5);
    const rid = await roundId();
    await db
      .insertInto("voterGroupMembers")
      .values([
        { voterGroupId: g, roundId: rid, address: A1 },
        { voterGroupId: g, roundId: rid, address: A2 },
      ])
      .execute();

    const res = await publicGet(
      jsonRequest(
        "GET",
        `http://localhost/api/flow-council/voter-groups/public?chainId=${TEST_CHAIN_ID}&councilId=${TEST_COUNCIL_ADDRESS}`,
      ),
    );
    // The public endpoint is a clean external contract: { groups: [...] } with
    // no success envelope.
    const body = await readJson(res);
    const group = body.groups.find(
      (x: { name: string }) => x.name === "Holders",
    );
    expect(group).toBeDefined();
    expect(group.eligibilityMethod).toBe("gooddollar");
    expect(group.members.sort()).toEqual([A1, A2].sort());
  });

  it("returns an empty list for an unknown council", async () => {
    const res = await publicGet(
      jsonRequest(
        "GET",
        `http://localhost/api/flow-council/voter-groups/public?chainId=${TEST_CHAIN_ID}&councilId=0x0000000000000000000000000000000000000000`,
      ),
    );
    const body = await readJson(res);
    expect(body.groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lazy auto-migration of an existing council to a "Default" group
// ---------------------------------------------------------------------------

describe("voter-groups lazy migration", () => {
  it("creates a Default group seeded from active onchain voters on first GET", async () => {
    // A1 active, A2 removed (votingPower 0 → excluded from the Default group).
    apolloVotersRef.current = [
      { account: A1, votingPower: "10" },
      { account: A2, votingPower: "0" },
    ];

    const res = await groupsGet(
      jsonRequest(
        "GET",
        `${BASE}?chainId=${TEST_CHAIN_ID}&councilId=${TEST_COUNCIL_ADDRESS}`,
      ),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].name).toBe("Default");
    expect(body.groups[0].eligibilityMethod).toBe("manual");
    expect(body.groups[0].members).toEqual([A1.toLowerCase()]);
  });

  it("does not migrate again when a group already exists", async () => {
    await createGroup("Existing");
    apolloVotersRef.current = [{ account: A1, votingPower: "10" }];

    const res = await groupsGet(
      jsonRequest(
        "GET",
        `${BASE}?chainId=${TEST_CHAIN_ID}&councilId=${TEST_COUNCIL_ADDRESS}`,
      ),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].name).toBe("Existing");
    expect(body.groups[0].members).toEqual([]);
  });
});
