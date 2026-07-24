import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

// Task 9 of .claude/specs/nft-voter-group-impl-plan.md. The route does not
// exist yet; these tests define its contract.
//
//   POST /api/flow-council/eligibility/nft-status
//   body:     { chainId, councilId, address }
//   response: { success: true, votingPower: string, botHasRole: boolean,
//               requirements: [{ groupId, name, votes, status }] }
//   status:   "met" | "unmet" | "unknown"
//
// The route is strictly read-only: criterion 13 requires that no page load or
// eligibility check produces an on-chain transaction.

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

vi.mock("../../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { POST as statusPost } from "./route";
import {
  getTestDb,
  resetDb,
  seedTestData,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
} from "@tests/helpers/db";
import {
  failRead,
  nftChain,
  resetNftChain,
  setContract,
  setVotingPower,
  RPC_ERROR_SENTINEL,
} from "@tests/helpers/nftChain";

const db = getTestDb();

const STATUS = "http://localhost/api/flow-council/eligibility/nft-status";

function address(suffix: string): string {
  return `0x${suffix.padStart(40, "0")}`;
}

const COLLECTION_721 = address("beef721");
const COLLECTION_1155 = address("beef1155");
const HOLDER = address("b01de1");
const NON_HOLDER = address("f00d2");

const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  await seedTestData(db);
  resetNftChain();
  setContract(COLLECTION_721, {
    kind: "erc721",
    name: "Flowstaters",
    holders: [HOLDER],
  });
  setContract(COLLECTION_1155, {
    kind: "erc1155",
    name: "Community Pass",
    holders: { [HOLDER.toLowerCase()]: ["1"] },
  });
});

async function requestStatus(body: Record<string, unknown>) {
  const res = await statusPost(
    new Request(STATUS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, ...body }),
    }),
  );
  const text = await res.text();
  return { res, text, body: JSON.parse(text) };
}

async function roundId(): Promise<number> {
  const round = await db
    .selectFrom("rounds")
    .select("id")
    .where("chainId", "=", TEST_CHAIN_ID)
    .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
    .executeTakeFirstOrThrow();

  return round.id;
}

async function insertNftGroup(opts: {
  name: string;
  contractAddress?: string;
  tokenStandard?: "erc721" | "erc1155";
  tokenId?: string | null;
  defaultVotingPower?: number;
  acquisitionUrl?: string | null;
}): Promise<number> {
  const rid = await roundId();
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
      nftCollectionName: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return g.id;
}

async function dbSnapshot(): Promise<string> {
  const [groups, members, rounds] = await Promise.all([
    db.selectFrom("voterGroups").selectAll().orderBy("id", "asc").execute(),
    db
      .selectFrom("voterGroupMembers")
      .selectAll()
      .orderBy("id", "asc")
      .execute(),
    db.selectFrom("rounds").selectAll().orderBy("id", "asc").execute(),
  ]);

  return JSON.stringify({ groups, members, rounds });
}

// ---------------------------------------------------------------------------
// Spec behavior 4-5: every configured requirement resolves to met / unmet /
// unknown for the connected wallet.
// ---------------------------------------------------------------------------

describe("nft-status requirement resolution", () => {
  it("returns a met row and an unmet row for the same wallet", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      tokenStandard: "erc721",
      defaultVotingPower: 20,
    });
    const community = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "9",
      defaultVotingPower: 5,
    });

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.success).toBe(true);
    expect(body.requirements).toEqual([
      { groupId: core, name: "Core", votes: 20, status: "met" },
      { groupId: community, name: "Community", votes: 5, status: "unmet" },
    ]);
  });

  it("resolves a 1155 requirement against the configured token id", async () => {
    const community = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.requirements).toEqual([
      { groupId: community, name: "Community", votes: 5, status: "met" },
    ]);
  });

  it("returns every requirement as unmet for a wallet holding nothing", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await requestStatus({ address: NON_HOLDER });

    expect(body.success).toBe(true);
    expect(body.requirements.map((r: { status: string }) => r.status)).toEqual([
      "unmet",
    ]);
    expect(body.votingPower).toBe("0");
  });

  it("orders requirements by group id so ties break toward the oldest group", async () => {
    const first = await insertNftGroup({
      name: "First",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    const second = await insertNftGroup({
      name: "Second",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 20,
    });

    const { body } = await requestStatus({ address: HOLDER });

    expect(
      body.requirements.map((r: { groupId: number }) => r.groupId),
    ).toEqual([first, second]);
  });

  it("returns an empty requirement list on a council with no nft groups", async () => {
    const rid = await roundId();
    await db
      .insertInto("voterGroups")
      .values({
        roundId: rid,
        name: "Manual",
        eligibilityMethod: "manual",
        defaultVotingPower: 10,
      })
      .execute();

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.success).toBe(true);
    expect(body.requirements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Spec error state: "A read failure must never be presented as 'you don't
// qualify'."
// ---------------------------------------------------------------------------

describe("nft-status read failures", () => {
  it("resolves a failed balance read to unknown, never unmet", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    failRead(COLLECTION_721, "balanceOf");

    const { text, body } = await requestStatus({ address: HOLDER });

    expect(body.success).toBe(true);
    expect(body.requirements).toEqual([
      { groupId: core, name: "Core", votes: 20, status: "unknown" },
    ]);
    expect(text).not.toContain(RPC_ERROR_SENTINEL);
  });

  it("degrades only the failing row and leaves the others intact", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    const community = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });
    failRead(COLLECTION_721, "balanceOf");

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.requirements).toEqual([
      { groupId: core, name: "Core", votes: 20, status: "unknown" },
      { groupId: community, name: "Community", votes: 5, status: "met" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Spec behavior 3 and the council-wide bot permission error state.
// ---------------------------------------------------------------------------

describe("nft-status council and wallet state", () => {
  it("reports the on-chain voting power of an existing voter", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    setVotingPower(HOLDER, 12n);

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.success).toBe(true);
    expect(body.votingPower).toBe("12");
  });

  it("propagates botHasRole false so the popup can disable claiming", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    nftChain.botHasRole = false;

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.success).toBe(true);
    expect(body.botHasRole).toBe(false);
    expect(body.requirements).toHaveLength(1);
  });

  it("reports botHasRole true on a correctly configured council", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await requestStatus({ address: HOLDER });

    expect(body.botHasRole).toBe(true);
  });

  it("rejects a request with no address", async () => {
    await insertNftGroup({ name: "Core" });

    const { body } = await requestStatus({});

    expect(body.success).toBe(false);
  });

  it("rejects a malformed address", async () => {
    await insertNftGroup({ name: "Core" });

    const { body } = await requestStatus({ address: "0xnope" });

    expect(body.success).toBe(false);
  });

  it("rejects an unknown council", async () => {
    const { body } = await requestStatus({
      councilId: address("dead"),
      address: HOLDER,
    });

    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Criterion 13: no page load or check causes an on-chain transaction.
// ---------------------------------------------------------------------------

describe("nft-status is read-only", () => {
  it("performs zero database writes and zero transactions", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });

    const before = await dbSnapshot();
    const { body } = await requestStatus({ address: HOLDER });
    const after = await dbSnapshot();

    expect(body.success).toBe(true);
    expect(after).toBe(before);
    expect(nftChain.writes).toEqual([]);
    expect(nftChain.receiptWaits).toEqual([]);
  });

  it("does not create a membership row for a wallet that meets a requirement", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });

    const { body } = await requestStatus({ address: HOLDER });
    expect(body.requirements[0].status).toBe("met");

    const members = await db
      .selectFrom("voterGroupMembers")
      .selectAll()
      .execute();
    expect(members).toEqual([]);
  });

  it("does not touch the council's claim rate-limit slot", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    await requestStatus({ address: HOLDER });

    const round = await db
      .selectFrom("rounds")
      .select("lastClaimAt")
      .where("id", "=", await roundId())
      .executeTakeFirstOrThrow();
    expect(round.lastClaimAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Malformed requests are the caller's mistake: 400, matching the claim route,
// never the outer catch's 500.
// ---------------------------------------------------------------------------

describe("nft-status malformed requests", () => {
  it("returns 400 for a body that is not JSON", async () => {
    const res = await statusPost(
      new Request(STATUS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await statusPost(
      new Request(STATUS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: TEST_CHAIN_ID }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
