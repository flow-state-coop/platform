import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

// Every chain touch in this suite goes through viem's createPublicClient /
// createWalletClient. The shared nftChain simulator answers all of them from
// per-test fixtures: hasOnChainRole (in ../auth) passes only for the admin
// address, and NFT detection / holder reads resolve against registered
// collections. It also records reads and writes so a test can assert that a
// route performed no RPC at all.
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  const { createNftMockPublicClient, createNftMockWalletClient } = await import(
    "@tests/helpers/nftChain"
  );
  return {
    ...actual,
    createPublicClient: vi.fn(() => createNftMockPublicClient()),
    createWalletClient: vi.fn(() => createNftMockWalletClient()),
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

import { getAddress } from "viem";
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
import { nftChain, resetNftChain, setContract } from "@tests/helpers/nftChain";
import { CELO_CHAIN_ID } from "@/app/flow-councils/lib/constants";

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
  resetNftChain();
  seedContracts();
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
  eligibilityMethod: "manual" | "gooddollar" | "metrics" = "manual",
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
// NFT fixtures shared by the NFT voter-group blocks below.
// Spec: .claude/specs/nft-voter-group.md
// ---------------------------------------------------------------------------

function address(suffix: string): string {
  return `0x${suffix.padStart(40, "0")}`;
}

const COLLECTION_721 = address("beef721");
const COLLECTION_721_B = address("beef722");
const COLLECTION_1155 = address("beef1155");
const TOKEN_ERC20 = address("dec1a5");
const LEGACY_721 = address("01d721");
const EOA_ADDRESS = address("e0a");
const CELO_COUNCIL_ADDRESS = address("ce10c0");

function seedContracts() {
  setContract(COLLECTION_721, { kind: "erc721", name: "Flowstaters" });
  setContract(COLLECTION_721_B, {
    kind: "erc721",
    name: "Core Contributors",
  });
  setContract(COLLECTION_1155, { kind: "erc1155", name: "Community Pass" });
  setContract(TOKEN_ERC20, { kind: "erc20", name: "Some Token" });
  setContract(LEGACY_721, { kind: "pre165Erc721", name: "Cryptopunk-era" });
  setContract(EOA_ADDRESS, { kind: "eoa" });
}

type NftConfig = {
  contractAddress: string;
  tokenStandard: "erc721" | "erc1155";
  tokenId?: string;
  acquisitionUrl?: string;
  collectionName?: string;
};

async function seedCeloCouncil(): Promise<number> {
  const round = await db
    .insertInto("rounds")
    .values({
      chainId: CELO_CHAIN_ID,
      flowCouncilAddress: CELO_COUNCIL_ADDRESS,
      applicationsClosed: false,
      details: JSON.stringify({}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return round.id;
}

async function insertNftGroup(opts: {
  roundId?: number;
  name: string;
  contractAddress?: string;
  tokenStandard?: "erc721" | "erc1155";
  tokenId?: string | null;
  defaultVotingPower?: number;
  acquisitionUrl?: string | null;
  collectionName?: string | null;
}): Promise<number> {
  const rid = opts.roundId ?? (await roundId());
  const g = await db
    .insertInto("voterGroups")
    .values({
      roundId: rid,
      name: opts.name,
      eligibilityMethod: "nft",
      defaultVotingPower: opts.defaultVotingPower ?? 10,
      nftContractAddress: (
        opts.contractAddress ?? COLLECTION_721
      ).toLowerCase(),
      nftTokenStandard: opts.tokenStandard ?? "erc721",
      nftTokenId: opts.tokenId ?? null,
      nftAcquisitionUrl: opts.acquisitionUrl ?? null,
      nftCollectionName: opts.collectionName ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return g.id;
}

async function groupRow(id: number) {
  return db
    .selectFrom("voterGroups")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
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

  it("rejects an unknown eligibilityMethod via the schema", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Bad",
        eligibilityMethod: "carrier-pigeon",
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

  it("PATCH cannot change a metrics group's eligibility method (400)", async () => {
    const id = await createGroup("Metrics", "metrics");
    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        eligibilityMethod: "manual",
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);

    const stored = await db
      .selectFrom("voterGroups")
      .select("eligibilityMethod")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(stored.eligibilityMethod).toBe("metrics");
  });

  it("PATCH cannot change a group to metrics (400)", async () => {
    const id = await createGroup("Manual", "manual");
    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        eligibilityMethod: "metrics",
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);

    const stored = await db
      .selectFrom("voterGroups")
      .select("eligibilityMethod")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(stored.eligibilityMethod).toBe("manual");
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

  it("omits the member lists entirely when includeMembers=0", async () => {
    const g = await createGroup("Holders", "gooddollar", 5);
    const rid = await roundId();
    await db
      .insertInto("voterGroupMembers")
      .values([{ voterGroupId: g, roundId: rid, address: A1 }])
      .execute();

    const res = await publicGet(
      jsonRequest(
        "GET",
        `http://localhost/api/flow-council/voter-groups/public?chainId=${TEST_CHAIN_ID}&councilId=${TEST_COUNCIL_ADDRESS}&includeMembers=0`,
      ),
    );
    const body = await readJson(res);
    const group = body.groups.find(
      (x: { name: string }) => x.name === "Holders",
    );

    expect(group).toBeDefined();
    expect("members" in group).toBe(false);
    expect(group.defaultVotingPower).toBe(5);
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

// ===========================================================================
// NFT Holder voter groups
// Spec: .claude/specs/nft-voter-group.md
// Plan: .claude/specs/nft-voter-group-impl-plan.md tasks 6 and 7
//
// Request contract assumed by every block below:
//   POST   { chainId, councilId, name, eligibilityMethod: "nft",
//            defaultVotingPower, nftConfig: { contractAddress, tokenStandard,
//            tokenId?, acquisitionUrl?, collectionName? } }
//   PATCH  same, with every field optional and nftConfig always a whole object.
// ===========================================================================

const GOODDOLLAR_EXCLUSIVITY_ERROR =
  "This council uses GoodDollar eligibility. A council uses one automated method or the other.";
const NFT_EXCLUSIVITY_ERROR =
  "This council uses NFT Holder eligibility. A council uses one automated method or the other.";
const NFT_DUPLICATE_ERROR =
  "This council already has an NFT group for that collection";
const LOOKS_LIKE_TOKEN_ERROR =
  "This looks like a token contract, not an NFT collection.";

// ---------------------------------------------------------------------------
// Spec: "A council uses one automated method or the other" (criterion 5)
// ---------------------------------------------------------------------------

describe("voter-groups NFT / GoodDollar exclusivity", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };
  const celoBase = {
    chainId: CELO_CHAIN_ID,
    councilId: CELO_COUNCIL_ADDRESS,
  };

  it("rejects POST of an nft group on a council that has a GoodDollar group", async () => {
    await createGroup("GoodDollar holders", "gooddollar");

    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Flowstaters",
        eligibilityMethod: "nft",
        defaultVotingPower: 20,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(GOODDOLLAR_EXCLUSIVITY_ERROR);

    const nftGroups = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("eligibilityMethod", "=", "nft")
      .execute();
    expect(nftGroups).toEqual([]);
  });

  it("rejects POST of a GoodDollar group on a council that has an nft group", async () => {
    const rid = await seedCeloCouncil();
    await insertNftGroup({ roundId: rid, name: "Flowstaters" });

    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...celoBase,
        name: "GoodDollar holders",
        eligibilityMethod: "gooddollar",
        defaultVotingPower: 5,
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(NFT_EXCLUSIVITY_ERROR);

    const goodDollarGroups = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("eligibilityMethod", "=", "gooddollar")
      .execute();
    expect(goodDollarGroups).toEqual([]);
  });

  it("rejects PATCH switching a manual group to nft on a GoodDollar council", async () => {
    await createGroup("GoodDollar holders", "gooddollar");
    const manual = await createGroup("Manual");

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${manual}`, {
        ...base,
        eligibilityMethod: "nft",
        defaultVotingPower: 20,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(GOODDOLLAR_EXCLUSIVITY_ERROR);

    const stored = await groupRow(manual);
    expect(stored.eligibilityMethod).toBe("manual");
    expect(stored.nftContractAddress).toBeNull();
  });

  it("rejects PATCH switching a manual group to gooddollar on an NFT council", async () => {
    const rid = await seedCeloCouncil();
    await insertNftGroup({ roundId: rid, name: "Flowstaters" });
    const manual = await db
      .insertInto("voterGroups")
      .values({
        roundId: rid,
        name: "Manual",
        eligibilityMethod: "manual",
        defaultVotingPower: 10,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${manual.id}`, {
        ...celoBase,
        eligibilityMethod: "gooddollar",
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(NFT_EXCLUSIVITY_ERROR);

    const stored = await groupRow(manual.id);
    expect(stored.eligibilityMethod).toBe("manual");
  });

  // Spec / plan: the guard must not introduce a one-GoodDollar-group-per-council
  // rule. GoodDollar councils are unaffected by this feature (criterion 17).
  it("still allows a second GoodDollar group on a GoodDollar council", async () => {
    const rid = await seedCeloCouncil();
    await db
      .insertInto("voterGroups")
      .values({
        roundId: rid,
        name: "GD one",
        eligibilityMethod: "gooddollar",
        defaultVotingPower: 5,
      })
      .execute();

    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...celoBase,
        name: "GD two",
        eligibilityMethod: "gooddollar",
        defaultVotingPower: 5,
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const goodDollarGroups = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("roundId", "=", rid)
      .where("eligibilityMethod", "=", "gooddollar")
      .execute();
    expect(goodDollarGroups).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Spec: "Two NFT groups on the same council cannot point at the same contract
// and token ID... In practice this means one group per ERC-721 collection"
// ---------------------------------------------------------------------------

describe("voter-groups NFT duplicate rule", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  function nftBody(name: string, config: NftConfig, votes = 10) {
    return {
      ...base,
      name,
      eligibilityMethod: "nft",
      defaultVotingPower: votes,
      nftConfig: config,
    };
  }

  it("rejects a second nft group with the same contract and token id (409)", async () => {
    await insertNftGroup({
      name: "Tier one",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
    });

    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody("Tier two", {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
          tokenId: "1",
        }),
      ),
    );

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(NFT_DUPLICATE_ERROR);
  });

  // The COALESCE(token_id, '') in voter_groups_round_nft_unique is deliberate
  // product behavior: an ERC-721 group has no token id to distinguish it, so a
  // collection can back at most one group per council.
  it("rejects a second ERC-721 group on the same contract (409)", async () => {
    await insertNftGroup({
      name: "Tier one",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });

    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody("Tier two", {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        }),
      ),
    );

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(NFT_DUPLICATE_ERROR);
  });

  it("rejects a duplicate whose contract address differs only in case (409)", async () => {
    await insertNftGroup({
      name: "Tier one",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });

    const checksummed = getAddress(COLLECTION_721);
    expect(checksummed).not.toBe(COLLECTION_721);

    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody("Tier two", {
          contractAddress: checksummed,
          tokenStandard: "erc721",
        }),
      ),
    );

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(NFT_DUPLICATE_ERROR);
  });

  it("allows two nft groups on the same ERC-1155 contract with different token ids", async () => {
    await insertNftGroup({
      name: "Tier one",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
    });

    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody("Tier two", {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
          tokenId: "2",
        }),
      ),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(body.id);
    expect(stored.nftTokenId).toBe("2");
  });

  it("allows tiering across two different collections", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
      defaultVotingPower: 20,
    });

    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody(
          "Community",
          {
            contractAddress: COLLECTION_721_B,
            tokenStandard: "erc721",
          },
          5,
        ),
      ),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const nftGroups = await db
      .selectFrom("voterGroups")
      .select(["nftContractAddress", "defaultVotingPower"])
      .where("eligibilityMethod", "=", "nft")
      .orderBy("id", "asc")
      .execute();
    expect(nftGroups).toEqual([
      { nftContractAddress: COLLECTION_721, defaultVotingPower: 20 },
      { nftContractAddress: COLLECTION_721_B, defaultVotingPower: 5 },
    ]);
  });

  it("rejects a PATCH that would duplicate another group's collection (409)", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });
    const second = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_721_B,
      tokenStandard: "erc721",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${second}`, {
        ...base,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe(NFT_DUPLICATE_ERROR);

    const stored = await groupRow(second);
    expect(stored.nftContractAddress).toBe(COLLECTION_721_B);
  });
});

// ---------------------------------------------------------------------------
// Criterion 4: "Editing a group's contract address or token ID can never leave
// it in a state where it matches nobody, regardless of which fields the admin
// changed." The NFT config is written as a whole unit, never field-by-field.
// ---------------------------------------------------------------------------

describe("voter-groups NFT config unit semantics", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  async function assertNftConfigInvariant() {
    const rows = await db
      .selectFrom("voterGroups")
      .select([
        "id",
        "eligibilityMethod",
        "nftContractAddress",
        "nftTokenStandard",
        "nftTokenId",
        "nftAcquisitionUrl",
        "nftCollectionName",
      ])
      .execute();

    for (const row of rows) {
      if (row.eligibilityMethod === "nft") {
        expect(row.nftContractAddress).not.toBeNull();
        expect(["erc721", "erc1155"]).toContain(row.nftTokenStandard);
        if (row.nftTokenStandard === "erc1155") {
          expect(row.nftTokenId).not.toBeNull();
        } else {
          expect(row.nftTokenId).toBeNull();
        }
      } else {
        expect(row.nftContractAddress).toBeNull();
        expect(row.nftTokenStandard).toBeNull();
        expect(row.nftTokenId).toBeNull();
        expect(row.nftAcquisitionUrl).toBeNull();
        expect(row.nftCollectionName).toBeNull();
      }
    }
  }

  it("rejects PATCH from erc721 to erc1155 without a token id", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        nftConfig: {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
        },
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);

    const stored = await groupRow(id);
    expect(stored.nftTokenStandard).toBe("erc721");
    expect(stored.nftContractAddress).toBe(COLLECTION_721);
    expect(stored.nftTokenId).toBeNull();
    await assertNftConfigInvariant();
  });

  it("PATCH from erc1155 to erc721 clears the token id", async () => {
    const id = await insertNftGroup({
      name: "Community Pass",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "42",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(id);
    expect(stored.nftTokenStandard).toBe("erc721");
    expect(stored.nftContractAddress).toBe(COLLECTION_721);
    expect(stored.nftTokenId).toBeNull();
    await assertNftConfigInvariant();
  });

  it("rejects an erc721 config that carries a token id", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
          tokenId: "9",
        },
      }),
    );

    expect(res.status).toBe(400);
    await assertNftConfigInvariant();
  });

  it("holds the config invariant across every PATCH sequence", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });

    const payloads: Record<string, unknown>[] = [
      { name: "Renamed" },
      { defaultVotingPower: 42 },
      {
        nftConfig: {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
        },
      },
      {
        nftConfig: {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
          tokenId: "7",
        },
      },
      {
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
          tokenId: "7",
        },
      },
      { nftConfig: { contractAddress: COLLECTION_721_B } },
      {
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      },
      { eligibilityMethod: "manual" },
      { eligibilityMethod: "nft" },
      {
        eligibilityMethod: "nft",
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      },
    ];

    for (const payload of payloads) {
      await groupsPatch(
        jsonRequest("PATCH", `${BASE}?id=${id}`, { ...base, ...payload }),
      );
      await assertNftConfigInvariant();
    }
  });

  it("leaves the five nft columns untouched when a PATCH omits the config", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "42",
      acquisitionUrl: "https://example.test/mint",
      collectionName: "Community Pass",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        name: "Renamed group",
        defaultVotingPower: 33,
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(id);
    expect(stored.name).toBe("Renamed group");
    expect(stored.defaultVotingPower).toBe(33);
    expect(stored.nftContractAddress).toBe(COLLECTION_1155);
    expect(stored.nftTokenStandard).toBe("erc1155");
    expect(stored.nftTokenId).toBe("42");
    expect(stored.nftAcquisitionUrl).toBe("https://example.test/mint");
    expect(stored.nftCollectionName).toBe("Community Pass");
  });

  it("clears all five nft columns when an empty nft group switches to manual", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "42",
      acquisitionUrl: "https://example.test/mint",
      collectionName: "Community Pass",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        eligibilityMethod: "manual",
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(id);
    expect(stored.eligibilityMethod).toBe("manual");
    expect(stored.nftContractAddress).toBeNull();
    expect(stored.nftTokenStandard).toBeNull();
    expect(stored.nftTokenId).toBeNull();
    expect(stored.nftAcquisitionUrl).toBeNull();
    expect(stored.nftCollectionName).toBeNull();
  });

  it("never overwrites an admin-written label with a re-detected collection name", async () => {
    const id = await insertNftGroup({
      name: "Our core crew",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
      collectionName: "Flowstaters",
    });

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        nftConfig: {
          contractAddress: COLLECTION_721_B,
          tokenStandard: "erc721",
        },
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(id);
    expect(stored.name).toBe("Our core crew");
    expect(stored.nftCollectionName).toBe("Core Contributors");
  });
});

// ---------------------------------------------------------------------------
// Spec: "An existing group's eligibility method can be switched to or from
// 'NFT Holder' only while it has no members."
// ---------------------------------------------------------------------------

describe("voter-groups NFT method lock", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  async function addMember(groupId: number, addr: string) {
    const rid = await roundId();
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: groupId, roundId: rid, address: addr })
      .execute();
  }

  it("rejects switching a populated manual group to nft", async () => {
    const id = await createGroup("Manual");
    await addMember(id, A1);

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        eligibilityMethod: "nft",
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    expect(res.status).toBe(400);
    const stored = await groupRow(id);
    expect(stored.eligibilityMethod).toBe("manual");
    expect(stored.nftContractAddress).toBeNull();
  });

  it("rejects switching a populated nft group away from nft", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
    });
    await addMember(id, A1);

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        eligibilityMethod: "manual",
      }),
    );

    expect(res.status).toBe(400);
    const stored = await groupRow(id);
    expect(stored.eligibilityMethod).toBe("nft");
    expect(stored.nftContractAddress).toBe(COLLECTION_721);
  });

  it("allows switching an empty manual group to nft", async () => {
    const id = await createGroup("Manual");

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        eligibilityMethod: "nft",
        defaultVotingPower: 20,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(id);
    expect(stored.eligibilityMethod).toBe("nft");
    expect(stored.nftContractAddress).toBe(COLLECTION_721);
    expect(stored.defaultVotingPower).toBe(20);
  });

  // Spec: "The contract address, token ID, vote allocation, label, and link can
  // all be changed at any time, including after the group has members."
  it("allows editing a populated nft group's collection and allocation", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
      defaultVotingPower: 5,
    });
    await addMember(id, A1);

    const res = await groupsPatch(
      jsonRequest("PATCH", `${BASE}?id=${id}`, {
        ...base,
        defaultVotingPower: 25,
        nftConfig: {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
          tokenId: "3",
          acquisitionUrl: "https://example.test/mint",
        },
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(id);
    expect(stored.defaultVotingPower).toBe(25);
    expect(stored.nftContractAddress).toBe(COLLECTION_1155);
    expect(stored.nftTokenStandard).toBe("erc1155");
    expect(stored.nftTokenId).toBe("3");
    expect(stored.nftAcquisitionUrl).toBe("https://example.test/mint");
    // Existing members keep their votes and are not re-checked.
    expect(await memberCount(id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 3: "Pasting an address that is not an NFT contract is rejected at
// configuration time with a specific reason, and an ordinary (non-NFT) token
// contract is never accepted as a collection."
// ---------------------------------------------------------------------------

describe("voter-groups NFT contract verification", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  function nftBody(config: NftConfig) {
    return {
      ...base,
      name: "Some group",
      eligibilityMethod: "nft",
      defaultVotingPower: 10,
      nftConfig: config,
    };
  }

  async function expectNoNftGroup() {
    const rows = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("eligibilityMethod", "=", "nft")
      .execute();
    expect(rows).toEqual([]);
  }

  it("rejects an ERC-20 address submitted with a manual erc721 override", async () => {
    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody({
          contractAddress: TOKEN_ERC20,
          tokenStandard: "erc721",
        }),
      ),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(LOOKS_LIKE_TOKEN_ERROR);
    await expectNoNftGroup();
  });

  it("rejects an ERC-20 address submitted with a manual erc1155 override", async () => {
    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody({
          contractAddress: TOKEN_ERC20,
          tokenStandard: "erc1155",
          tokenId: "1",
        }),
      ),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe(LOOKS_LIKE_TOKEN_ERROR);
    await expectNoNftGroup();
  });

  it("rejects an address with no contract on this chain", async () => {
    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody({
          contractAddress: EOA_ADDRESS,
          tokenStandard: "erc721",
        }),
      ),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    await expectNoNftGroup();
  });

  it("rejects a submitted standard that contradicts detection", async () => {
    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody({
          contractAddress: COLLECTION_721,
          tokenStandard: "erc1155",
          tokenId: "1",
        }),
      ),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    await expectNoNftGroup();
  });

  it("accepts a pre-ERC-165 collection under a manual erc721 override", async () => {
    const res = await groupsPost(
      jsonRequest(
        "POST",
        BASE,
        nftBody({
          contractAddress: LEGACY_721,
          tokenStandard: "erc721",
        }),
      ),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(body.id);
    expect(stored.eligibilityMethod).toBe("nft");
    expect(stored.nftTokenStandard).toBe("erc721");
    expect(stored.nftContractAddress).toBe(LEGACY_721);
  });

  it("creates an ERC-721 group and caches the detected collection name", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Flowstaters",
        eligibilityMethod: "nft",
        defaultVotingPower: 20,
        nftConfig: {
          contractAddress: getAddress(COLLECTION_721),
          tokenStandard: "erc721",
          acquisitionUrl: "https://example.test/mint",
        },
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(body.id);
    expect(stored.eligibilityMethod).toBe("nft");
    expect(stored.defaultVotingPower).toBe(20);
    expect(stored.nftContractAddress).toBe(COLLECTION_721);
    expect(stored.nftTokenStandard).toBe("erc721");
    expect(stored.nftTokenId).toBeNull();
    expect(stored.nftAcquisitionUrl).toBe("https://example.test/mint");
    expect(stored.nftCollectionName).toBe("Flowstaters");
  });

  it("creates an ERC-1155 group with a token id", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Community Pass",
        eligibilityMethod: "nft",
        defaultVotingPower: 5,
        nftConfig: {
          contractAddress: COLLECTION_1155,
          tokenStandard: "erc1155",
          tokenId: "7",
        },
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await groupRow(body.id);
    expect(stored.nftTokenStandard).toBe("erc1155");
    expect(stored.nftTokenId).toBe("7");
    expect(stored.nftCollectionName).toBe("Community Pass");
  });

  it("rejects an nft group with no nft config (400)", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "No config",
        eligibilityMethod: "nft",
        defaultVotingPower: 10,
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    await expectNoNftGroup();
  });

  it("rejects an nft config on a non-nft group (400)", async () => {
    const res = await groupsPost(
      jsonRequest("POST", BASE, {
        ...base,
        name: "Manual with config",
        eligibilityMethod: "manual",
        defaultVotingPower: 10,
        nftConfig: {
          contractAddress: COLLECTION_721,
          tokenStandard: "erc721",
        },
      }),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Admin GET: nft fields exposed, every other group's shape untouched.
// ---------------------------------------------------------------------------

const NON_NFT_ADMIN_KEYS = [
  "defaultVotingPower",
  "eligibilityMethod",
  "id",
  "memberCount",
  "members",
  "name",
];

const NFT_ADMIN_KEYS = [
  ...NON_NFT_ADMIN_KEYS,
  "nftAcquisitionUrl",
  "nftCollectionName",
  "nftContractAddress",
  "nftTokenId",
  "nftTokenStandard",
].sort();

describe("voter-groups GET with nft groups", () => {
  async function fetchGroups() {
    const res = await groupsGet(
      jsonRequest(
        "GET",
        `${BASE}?chainId=${TEST_CHAIN_ID}&councilId=${TEST_COUNCIL_ADDRESS}`,
      ),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
    return body.groups as Record<string, unknown>[];
  }

  it("returns the five nft fields on an nft group", async () => {
    await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "7",
      defaultVotingPower: 20,
      acquisitionUrl: "https://example.test/mint",
      collectionName: "Community Pass",
    });

    const groups = await fetchGroups();
    const nft = groups.find((g) => g.name === "Flowstaters");

    expect(nft).toBeDefined();
    expect(nft!.eligibilityMethod).toBe("nft");
    expect(nft!.defaultVotingPower).toBe(20);
    expect(nft!.nftContractAddress).toBe(COLLECTION_1155);
    expect(nft!.nftTokenStandard).toBe("erc1155");
    expect(nft!.nftTokenId).toBe("7");
    expect(nft!.nftAcquisitionUrl).toBe("https://example.test/mint");
    expect(nft!.nftCollectionName).toBe("Community Pass");
    expect(Object.keys(nft!).sort()).toEqual(NFT_ADMIN_KEYS);
  });

  it("leaves every non-nft group's shape byte-identical", async () => {
    await createGroup("Manual group");
    await createGroup("Metrics group", "metrics");
    await createGroup("GoodDollar group", "gooddollar");
    await insertNftGroup({ name: "Flowstaters" });

    const groups = await fetchGroups();

    for (const group of groups) {
      if (group.eligibilityMethod === "nft") continue;
      expect(Object.keys(group).sort()).toEqual(NON_NFT_ADMIN_KEYS);
    }
  });
});

// ---------------------------------------------------------------------------
// Public route (task 7). Criterion 12: the full requirement list renders with
// no wallet connected and zero RPC calls.
// ---------------------------------------------------------------------------

const NON_NFT_PUBLIC_KEYS = [
  "defaultVotingPower",
  "eligibilityMethod",
  "groupId",
  "members",
  "name",
];

const NFT_PUBLIC_KEYS = [
  ...NON_NFT_PUBLIC_KEYS,
  "nftAcquisitionUrl",
  "nftCollectionName",
  "nftContractAddress",
  "nftTokenId",
  "nftTokenStandard",
].sort();

describe("voter-groups public API with nft groups", () => {
  async function fetchPublic() {
    const res = await publicGet(
      jsonRequest(
        "GET",
        `http://localhost/api/flow-council/voter-groups/public?chainId=${TEST_CHAIN_ID}&councilId=${TEST_COUNCIL_ADDRESS}`,
      ),
    );
    const body = await readJson(res);
    return body.groups as Record<string, unknown>[];
  }

  it("exposes groupId, defaultVotingPower and the nft fields on nft groups", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
      defaultVotingPower: 20,
      acquisitionUrl: "https://example.test/mint",
      collectionName: "Flowstaters NFT",
    });

    const groups = await fetchPublic();
    const nft = groups.find((g) => g.name === "Flowstaters");

    expect(nft).toBeDefined();
    expect(nft!.groupId).toBe(id);
    expect(nft!.eligibilityMethod).toBe("nft");
    expect(nft!.defaultVotingPower).toBe(20);
    expect(nft!.nftContractAddress).toBe(COLLECTION_721);
    expect(nft!.nftTokenStandard).toBe("erc721");
    expect(nft!.nftTokenId).toBeNull();
    expect(nft!.nftAcquisitionUrl).toBe("https://example.test/mint");
    expect(nft!.nftCollectionName).toBe("Flowstaters NFT");
    expect(nft!.members).toEqual([]);
    expect(Object.keys(nft!).sort()).toEqual(NFT_PUBLIC_KEYS);
  });

  it("leaves non-nft groups' shape unchanged", async () => {
    const gd = await createGroup("Holders", "gooddollar", 5);
    const rid = await roundId();
    await db
      .insertInto("voterGroupMembers")
      .values([
        { voterGroupId: gd, roundId: rid, address: A1 },
        { voterGroupId: gd, roundId: rid, address: A2 },
      ])
      .execute();
    await insertNftGroup({ name: "Flowstaters" });

    const groups = await fetchPublic();
    const goodDollar = groups.find((g) => g.name === "Holders");

    expect(goodDollar).toBeDefined();
    expect(goodDollar!.groupId).toBe(gd);
    expect(goodDollar!.eligibilityMethod).toBe("gooddollar");
    expect(goodDollar!.defaultVotingPower).toBe(5);
    expect((goodDollar!.members as string[]).sort()).toEqual([A1, A2].sort());
    expect(Object.keys(goodDollar!).sort()).toEqual(NON_NFT_PUBLIC_KEYS);
  });

  it("renders the full requirement list with no wallet and zero RPC calls", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
      defaultVotingPower: 20,
      acquisitionUrl: "https://example.test/core",
    });
    await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });

    nftChain.reads = [];
    const groups = await fetchPublic();
    const nftGroups = groups.filter((g) => g.eligibilityMethod === "nft");

    expect(nftGroups.map((g) => [g.name, g.defaultVotingPower])).toEqual([
      ["Core", 20],
      ["Community", 5],
    ]);
    expect(nftChain.reads).toEqual([]);
    expect(nftChain.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deletion + hand-added members on nft groups.
// ---------------------------------------------------------------------------

describe("voter-groups nft deletion and hand-added members", () => {
  const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

  it("refuses to delete a populated nft group (400)", async () => {
    const id = await insertNftGroup({ name: "Flowstaters" });
    await createGroup("Manual");
    const rid = await roundId();
    await db
      .insertInto("voterGroupMembers")
      .values({ voterGroupId: id, roundId: rid, address: A1 })
      .execute();

    const res = await groupsDelete(
      jsonRequest("DELETE", `${BASE}?id=${id}`, base),
    );

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);

    const stored = await groupRow(id);
    expect(stored.eligibilityMethod).toBe("nft");
    expect(await memberCount(id)).toBe(1);
  });

  it("deletes an empty nft group when another group remains", async () => {
    const id = await insertNftGroup({ name: "Flowstaters" });
    await createGroup("Manual");

    const res = await groupsDelete(
      jsonRequest("DELETE", `${BASE}?id=${id}`, base),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);
  });

  // Spec: "Admins can hand-add addresses to an NFT group from the voter table,
  // same as any other group. Those members are not treated specially."
  it("lets an admin hand-add an address to an nft group", async () => {
    const id = await insertNftGroup({
      name: "Flowstaters",
      defaultVotingPower: 20,
    });

    const res = await memberPost(
      jsonRequest("POST", MEMBERS, {
        ...base,
        groupId: id,
        address: A1,
      }),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.inserted).toBe(true);

    const row = await db
      .selectFrom("voterGroupMembers")
      .select(["voterGroupId", "address"])
      .where("address", "=", A1.toLowerCase())
      .executeTakeFirstOrThrow();
    expect(row.voterGroupId).toBe(id);

    const stored = await groupRow(id);
    expect(stored.nftContractAddress).toBe(COLLECTION_721);
    expect(stored.defaultVotingPower).toBe(20);
  });
});
