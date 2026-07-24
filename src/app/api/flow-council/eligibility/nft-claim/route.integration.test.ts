import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

// Task 11 of .claude/specs/nft-voter-group-impl-plan.md. The route does not
// exist yet; these tests define its contract.
//
//   POST /api/flow-council/eligibility/nft-claim
//   body:     { address, chainId, councilId, signature, issuedAt }
//             issuedAt is epoch milliseconds.
//   success:  { success: true, votingPower, groupId, groupName }
//             (addVoter for a new voter, editVoter to raise an existing one
//             to a higher met tier; power is never lowered)
//   already:  { success: true, alreadyVoter: true, code: "already_voter",
//               votingPower }
//   refusal:  { success: false, code }
//   codes:    already_voter | not_eligible | check_unavailable | rate_limited
//             | bot_missing_role | invalid_signature | expired_signature
//             | chain_error | no_requirements
//
// The per-council rate-limit window lives in rounds.last_claim_at.

// The bot signer derives its account from this env var at call time.
vi.hoisted(() => {
  process.env.FLOW_STATE_ELIGIBILITY_PK ??=
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
});

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

// The claim route verifies the council was deployed by the factory by looking
// it up in the subgraph before the bot spends any gas.
const { councilIndexedRef } = vi.hoisted(() => ({
  councilIndexedRef: { current: true },
}));
vi.mock("@/lib/apollo", () => ({
  getApolloClient: () => ({
    query: async () => ({
      data: {
        flowCouncil: councilIndexedRef.current ? { id: "0xcouncil" } : null,
      },
    }),
  }),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { privateKeyToAccount } from "viem/accounts";
import { resetFactoryCouncilCache } from "../../auth";
import { buildClaimMessage } from "@/app/flow-councils/lib/claimMessage";
import { POST as claimPost } from "./route";
import {
  getTestDb,
  resetDb,
  seedTestData,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
} from "@tests/helpers/db";
import {
  addValidSignature,
  failRead,
  nftChain,
  resetNftChain,
  setContract,
  setVotingPower,
  RPC_ERROR_MESSAGE,
  RPC_ERROR_SENTINEL,
} from "@tests/helpers/nftChain";

const db = getTestDb();

const CLAIM = "http://localhost/api/flow-council/eligibility/nft-claim";

function address(suffix: string): string {
  return `0x${suffix.padStart(40, "0")}`;
}

const COLLECTION_721 = address("beef721");
const COLLECTION_1155 = address("beef1155");

// Claimant wallets are backed by real keys so the route's signature check runs
// genuine ECDSA. An EOA is verified locally, without touching the chain, so a
// registered fake would no longer be accepted (and a mock that accepted one
// would hide exactly the bug this check exists to catch).
const KEY_BY_ADDRESS = new Map<string, `0x${string}`>();

function claimant(privateKey: `0x${string}`): string {
  const account = privateKeyToAccount(privateKey);
  const addr = account.address.toLowerCase();
  KEY_BY_ADDRESS.set(addr, privateKey);
  return addr;
}

const HOLDER = claimant(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const HOLDER_2 = claimant(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);
const NON_HOLDER = claimant(
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
);

// A syntactically valid signature that recovers to some other address.
const BAD_SIGNATURE = `0x${"cd".repeat(64)}1b`;

async function signClaim(
  claimAddress: string,
  issuedAt: number,
): Promise<string> {
  const key = KEY_BY_ADDRESS.get(claimAddress.toLowerCase());

  if (!key) {
    return BAD_SIGNATURE;
  }

  return privateKeyToAccount(key).signMessage({
    message: buildClaimMessage({
      chainId: TEST_CHAIN_ID,
      councilId: TEST_COUNCIL_ADDRESS,
      address: claimAddress,
      issuedAt,
    }),
  });
}

const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  await seedTestData(db);
  resetNftChain();
  resetFactoryCouncilCache();
  councilIndexedRef.current = true;
  setContract(COLLECTION_721, {
    kind: "erc721",
    name: "Flowstaters",
    holders: [HOLDER, HOLDER_2],
  });
  setContract(COLLECTION_1155, {
    kind: "erc1155",
    name: "Community Pass",
    holders: { [HOLDER]: ["1"], [HOLDER_2]: ["1"] },
  });
});

async function claim(overrides: Record<string, unknown> = {}) {
  const claimAddress = (overrides.address as string) ?? HOLDER;
  const issuedAt = (overrides.issuedAt as number) ?? Date.now();
  const payload: Record<string, unknown> = {
    ...base,
    address: claimAddress,
    issuedAt,
    signature: await signClaim(claimAddress, issuedAt),
    ...overrides,
  };

  const res = await claimPost(
    new Request(CLAIM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      nftAcquisitionUrl: null,
      nftCollectionName: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return g.id;
}

async function insertManualGroup(name: string): Promise<number> {
  const rid = await roundId();
  const g = await db
    .insertInto("voterGroups")
    .values({
      roundId: rid,
      name,
      eligibilityMethod: "manual",
      defaultVotingPower: 10,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return g.id;
}

async function addMember(groupId: number, memberAddress: string) {
  const rid = await roundId();
  await db
    .insertInto("voterGroupMembers")
    .values({ voterGroupId: groupId, roundId: rid, address: memberAddress })
    .execute();
}

async function membershipRows(memberAddress: string) {
  return db
    .selectFrom("voterGroupMembers")
    .select(["voterGroupId", "address"])
    .where("address", "=", memberAddress.toLowerCase())
    .execute();
}

async function allMembershipRows() {
  return db.selectFrom("voterGroupMembers").selectAll().execute();
}

async function lastClaimAt(): Promise<Date | null> {
  const round = await db
    .selectFrom("rounds")
    .select("lastClaimAt")
    .where("id", "=", await roundId())
    .executeTakeFirstOrThrow();

  return round.lastClaimAt === null ? null : new Date(round.lastClaimAt);
}

async function setLastClaimAt(value: Date | null) {
  await db
    .updateTable("rounds")
    .set({ lastClaimAt: value })
    .where("id", "=", await roundId())
    .execute();
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

function addVoterWrites() {
  return nftChain.writes.filter((w) => w.functionName === "addVoter");
}

function editVoterWrites() {
  return nftChain.writes.filter((w) => w.functionName === "editVoter");
}

// ---------------------------------------------------------------------------
// Criterion 13: "No votes can be granted to an address without a signature from
// that address, and no page load or check causes an on-chain transaction."
// ---------------------------------------------------------------------------

describe("nft-claim signature gate", () => {
  it("refuses a claim carrying no signature and reaches no write", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const before = await dbSnapshot();
    const { body } = await claim({ signature: undefined });

    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_signature");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
    expect(await dbSnapshot()).toBe(before);
  });

  it("refuses a claim carrying a signature the wallet did not produce", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const before = await dbSnapshot();
    const { body } = await claim({ signature: BAD_SIGNATURE });

    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_signature");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
    expect(await dbSnapshot()).toBe(before);
  });

  it("refuses a signature produced by a different wallet than the one claiming", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({
      address: HOLDER,
      signature: await signClaim(HOLDER_2, Date.now()),
    });

    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_signature");
    expect(nftChain.writes).toEqual([]);
  });

  // A holder's EOA signature must never reach the chain verifier: that path
  // executes the caller's signature bytes (ERC-6492 deploys a validator that
  // calls an address the caller chose), and this route is anonymous.
  it("verifies an ordinary wallet without any chain call", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(nftChain.verifications).toEqual([]);
  });

  // Criterion 7: a smart-contract wallet proves its signature the way those
  // wallets require, which does need the chain.
  it("verifies a smart-contract wallet through the chain verifier", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    setContract(HOLDER, { kind: "erc165Other" });
    const safeSignature = `0x${"ab".repeat(65)}`;
    addValidSignature(safeSignature);

    const { body } = await claim({ signature: safeSignature });

    expect(body.success).toBe(true);
    expect(nftChain.verifications).toHaveLength(1);
    expect(nftChain.verifications[0].address.toLowerCase()).toBe(HOLDER);
  });

  // Spec behavior 7: the signed message names what it authorizes and binds it
  // to this council, chain, wallet and moment.
  it("binds the signed message to the council, chain, wallet and issue time", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    // Relative to now, so the signature stays inside the freshness window
    // whenever the suite runs, and floored to the second because the message
    // carries no sub-second precision.
    const issuedAt = Math.floor(Date.now() / 1000) * 1000;

    const { body } = await claim({ issuedAt });
    expect(body.success).toBe(true);

    // The binding is what the signature buys, so assert it by rejection: a
    // signature over a message naming a different council, chain, wallet or
    // moment must not be accepted here.
    const wrongBindings = [
      { chainId: TEST_CHAIN_ID + 1, councilId: TEST_COUNCIL_ADDRESS },
      { chainId: TEST_CHAIN_ID, councilId: address("dead") },
    ];

    for (const binding of wrongBindings) {
      const foreign = await privateKeyToAccount(
        KEY_BY_ADDRESS.get(HOLDER)!,
      ).signMessage({
        message: buildClaimMessage({
          ...binding,
          address: HOLDER,
          issuedAt: Date.now(),
        }),
      });

      const refused = await claim({ signature: foreign });

      expect(refused.body.success).toBe(false);
      expect(refused.body.code).toBe("invalid_signature");
    }
  });

  it("refuses a signature issued outside the freshness window", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({ issuedAt: Date.now() - 10 * 60_000 });

    expect(body.success).toBe(false);
    expect(body.code).toBe("expired_signature");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
    expect(await lastClaimAt()).toBeNull();
  });

  it("refuses a signature issued further in the future than the allowed skew", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({ issuedAt: Date.now() + 5 * 60_000 });

    expect(body.success).toBe(false);
    expect(body.code).toBe("expired_signature");
    expect(nftChain.writes).toEqual([]);
  });

  it("accepts a signature issued inside the allowed clock skew", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({ issuedAt: Date.now() + 10_000 });

    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 and 14: a holder claims, receives the configured votes, and the
// response carries them back immediately.
// ---------------------------------------------------------------------------

describe("nft-claim happy path", () => {
  it("grants the configured votes and records the membership", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });

    const { body } = await claim({ address: HOLDER });

    expect(body.success).toBe(true);
    expect(Number(body.votingPower)).toBe(20);
    expect(body.groupId).toBe(core);
    expect(body.groupName).toBe("Core");

    const writes = addVoterWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].address).toBe(TEST_COUNCIL_ADDRESS.toLowerCase());
    expect(String(writes[0].args[0]).toLowerCase()).toBe(HOLDER.toLowerCase());
    expect(writes[0].args[1]).toBe(20n);

    const rows = await membershipRows(HOLDER);
    expect(rows).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("waits for the transaction receipt before reporting success", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(nftChain.receiptWaits).toHaveLength(1);
  });

  it("resolves an ERC-1155 requirement against the configured token id", async () => {
    const community = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.groupId).toBe(community);
    expect(addVoterWrites()[0].args[1]).toBe(5n);
  });
});

// ---------------------------------------------------------------------------
// Criterion 10: "A wallet that already has voting power is never altered by an
// automated check, whether it was added by an admin or claimed earlier."
// The signed recheck (nft-claim tier upgrade below) may raise a voter's power,
// never lower it, so a voter at or above every met tier stays untouched.
// ---------------------------------------------------------------------------

describe("nft-claim already-a-voter protection", () => {
  it("is a no-op for a wallet that already has on-chain voting power", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    setVotingPower(HOLDER, 30n);

    const before = await dbSnapshot();
    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.alreadyVoter).toBe(true);
    expect(body.code).toBe("already_voter");
    expect(Number(body.votingPower)).toBe(30);
    expect(nftChain.writes).toEqual([]);
    expect(await dbSnapshot()).toBe(before);
  });

  it("leaves an admin-added voter in the group the admin chose", async () => {
    const manual = await insertManualGroup("Admin picks");
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    await addMember(manual, HOLDER);
    setVotingPower(HOLDER, 30n);

    const { body } = await claim({});

    expect(body.alreadyVoter).toBe(true);
    expect(nftChain.writes).toEqual([]);
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: manual, address: HOLDER.toLowerCase() },
    ]);
  });

  it("does not consume the rate-limit window for an already-a-voter request", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    setVotingPower(HOLDER, 30n);

    await claim({});

    expect(await lastClaimAt()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 11: "A voter whose power an admin zeroed out can claim again and
// actually receives votes, rather than being told it succeeded while nothing
// happens." (tech-eval hazard E4)
// ---------------------------------------------------------------------------

describe("nft-claim re-claim after an admin zeroed the voter", () => {
  it("grants votes to a wallet with an existing row and zero on-chain power", async () => {
    const manual = await insertManualGroup("Removed voters");
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    await addMember(manual, HOLDER);
    setVotingPower(HOLDER, 0n);

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(Number(body.votingPower)).toBe(20);
    expect(body.groupId).toBe(core);

    const writes = addVoterWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].args[1]).toBe(20n);

    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("moves the existing row rather than creating a second one", async () => {
    const manual = await insertManualGroup("Removed voters");
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    await addMember(manual, HOLDER);

    await claim({});

    const rows = await allMembershipRows();
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Recheck: an existing voter who now qualifies for a higher tier claims the
// increase. The route raises their power with editVoter and moves the
// membership row; a recheck may only ever raise a voter's power.
// ---------------------------------------------------------------------------

describe("nft-claim tier upgrade", () => {
  it("raises an existing voter to a higher met tier via editVoter", async () => {
    const community = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    await addMember(community, HOLDER);
    setVotingPower(HOLDER, 5n);

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.alreadyVoter).toBeUndefined();
    expect(Number(body.votingPower)).toBe(20);
    expect(body.groupId).toBe(core);

    expect(addVoterWrites()).toEqual([]);
    const edits = editVoterWrites();
    expect(edits).toHaveLength(1);
    expect(String(edits[0].args[0]).toLowerCase()).toBe(HOLDER.toLowerCase());
    expect(edits[0].args[1]).toBe(20n);

    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("records a membership row for an admin-added voter who upgrades", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    setVotingPower(HOLDER, 5n);

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(editVoterWrites()).toHaveLength(1);
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("consumes the rate-limit window like a first claim", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    setVotingPower(HOLDER, 5n);

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(await lastClaimAt()).not.toBeNull();
  });

  it("never lowers a voter whose power already meets the highest met tier", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    setVotingPower(HOLDER, 20n);

    const before = await dbSnapshot();
    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.alreadyVoter).toBe(true);
    expect(Number(body.votingPower)).toBe(20);
    expect(nftChain.writes).toEqual([]);
    expect(await dbSnapshot()).toBe(before);
  });

  // The recheck twin of "a read failure must never be presented as 'you don't
  // qualify'": an unread tier that could beat the current power must not
  // flatten to "no higher tier for you".
  it("returns check_unavailable when the read that could beat the current power failed", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    setVotingPower(HOLDER, 5n);
    failRead(COLLECTION_721, "balanceOf");

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("check_unavailable");
    expect(nftChain.writes).toEqual([]);
  });

  it("treats an unresolved tier below the current power as no upgrade", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    setVotingPower(HOLDER, 30n);
    failRead(COLLECTION_721, "balanceOf");

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.alreadyVoter).toBe(true);
    expect(nftChain.writes).toEqual([]);
  });

  it("restores the previous group when the upgrade write throws", async () => {
    const community = await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    await addMember(community, HOLDER);
    setVotingPower(HOLDER, 5n);
    nftChain.writeError = "boom";

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("chain_error");
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: community, address: HOLDER.toLowerCase() },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 9: "On a council with two NFT tiers, a wallet holding both ... after
// claiming holds exactly that many votes and appears in exactly one group."
// ---------------------------------------------------------------------------

describe("nft-claim overlapping eligibility", () => {
  it("grants the largest single allocation, not the sum", async () => {
    const core = await insertNftGroup({
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

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(Number(body.votingPower)).toBe(20);
    expect(body.groupId).toBe(core);

    const writes = addVoterWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].args[1]).toBe(20n);

    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("wins on allocation regardless of the order the groups were created", async () => {
    await insertNftGroup({
      name: "Community",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 5,
    });
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });

    const { body } = await claim({});

    expect(body.groupId).toBe(core);
    expect(addVoterWrites()[0].args[1]).toBe(20n);
  });

  // Spec: "Ties break toward the group created first."
  it("breaks an allocation tie toward the group created first", async () => {
    const first = await insertNftGroup({
      name: "First",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    await insertNftGroup({
      name: "Second",
      contractAddress: COLLECTION_1155,
      tokenStandard: "erc1155",
      tokenId: "1",
      defaultVotingPower: 20,
    });

    const { body } = await claim({});

    expect(body.groupId).toBe(first);
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: first, address: HOLDER.toLowerCase() },
    ]);
  });

  it("claims the met tier even when another requirement's read failed", async () => {
    await insertNftGroup({
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

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.groupId).toBe(community);
    expect(addVoterWrites()[0].args[1]).toBe(5n);
  });
});

// ---------------------------------------------------------------------------
// Criterion 16: "A failed on-chain assignment leaves no orphaned membership
// record, and retrying succeeds."
// ---------------------------------------------------------------------------

describe("nft-claim rollback", () => {
  it("leaves no membership row when the write throws, and the retry succeeds", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.writeError = RPC_ERROR_MESSAGE;

    const failed = await claim({});

    expect(failed.body.success).toBe(false);
    expect(failed.body.code).toBe("chain_error");
    expect(failed.text).not.toContain(RPC_ERROR_SENTINEL);
    expect(await allMembershipRows()).toEqual([]);
    expect(await lastClaimAt()).toBeNull();

    nftChain.writeError = null;
    const retry = await claim({});

    expect(retry.body.success).toBe(true);
    expect(Number(retry.body.votingPower)).toBe(20);
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
    expect(addVoterWrites()).toHaveLength(2);
  });

  it("restores a moved row's previous group when the write throws", async () => {
    const manual = await insertManualGroup("Removed voters");
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    await addMember(manual, HOLDER);
    nftChain.writeError = "execution reverted";

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("chain_error");
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: manual, address: HOLDER.toLowerCase() },
    ]);
    expect(await allMembershipRows()).toHaveLength(1);
  });

  // A broadcast transaction may still land, so the membership row is kept: a row
  // with zero on-chain power is repaired by the zeroed-voter re-claim path,
  // whereas deleting it after the tx lands would leave a voter holding votes
  // with no record, invisible to admins and unable to heal itself.
  it("keeps the membership row when the transaction is broadcast but never confirms", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.receiptError = "receipt timed out";

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("chain_error");
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("still rolls back when the transaction is broadcast and provably reverts", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.receiptStatus = "reverted";

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("chain_error");
    expect(await allMembershipRows()).toEqual([]);
  });

  // The explicit gas limit skips simulation, so a redundant claim broadcasts
  // and reverts on-chain with no readable reason. The route reads the voter
  // back: power at or above the winner's tier means a concurrent claim landed
  // first and this one already happened, not a chain_error.
  it("maps a broadcast revert onto already_voter when the voter appeared meanwhile", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.receiptStatus = "reverted";
    nftChain.writeHook = () => setVotingPower(HOLDER, 20n);

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.alreadyVoter).toBe(true);
    expect(Number(body.votingPower)).toBe(20);
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
    // The transaction was broadcast, so the rate window stays held.
    expect(await lastClaimAt()).not.toBeNull();
  });

  it("still fails a broadcast revert when the concurrent power is below the tier", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.receiptStatus = "reverted";
    nftChain.writeHook = () => setVotingPower(HOLDER, 5n);

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("chain_error");
    expect(await allMembershipRows()).toEqual([]);
  });

  it("treats an ALREADY_ADDED revert as success and keeps the membership row", async () => {
    const core = await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.writeError = "execution reverted: ALREADY_ADDED";

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(await membershipRows(HOLDER)).toEqual([
      { voterGroupId: core, address: HOLDER.toLowerCase() },
    ]);
  });

  it("reports the on-chain power when a fresh read resolves an ALREADY_ADDED revert", async () => {
    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });
    nftChain.writeError = "execution reverted: ALREADY_ADDED";
    nftChain.writeHook = () => setVotingPower(HOLDER, 30n);

    const { body } = await claim({});

    expect(body.success).toBe(true);
    expect(body.alreadyVoter).toBe(true);
    expect(Number(body.votingPower)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Spec error state: "Claims coming in too fast on one council ... Voters who hit
// it see 'try again in a moment', not a failure."
// ---------------------------------------------------------------------------

describe("nft-claim rate limiting", () => {
  it("returns 429 with code rate_limited when the window is already held", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    await setLastClaimAt(new Date());

    const { res, body } = await claim({});

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.code).toBe("rate_limited");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
  });

  it("claims the window before broadcasting the chain write", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({});

    expect(body.success).toBe(true);
    const claimed = await lastClaimAt();
    expect(claimed).not.toBeNull();
    expect(Date.now() - claimed!.getTime()).toBeLessThan(60_000);
  });

  it("does not claim the window for an invalid signature", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    await claim({ signature: BAD_SIGNATURE });

    expect(await lastClaimAt()).toBeNull();
  });

  it("does not claim the window for a wallet that meets no requirement", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({ address: NON_HOLDER });

    expect(body.code).toBe("not_eligible");
    expect(await lastClaimAt()).toBeNull();
  });

  it("releases the window when the transaction was never broadcast", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    const previous = new Date(Date.now() - 60_000);
    await setLastClaimAt(previous);
    nftChain.writeError = "boom";

    const { body } = await claim({});

    expect(body.code).toBe("chain_error");
    const restored = await lastClaimAt();
    expect(restored).not.toBeNull();
    expect(restored!.getTime()).toBe(previous.getTime());
  });

  it("holds the window when the transaction was broadcast", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    const previous = new Date(Date.now() - 60_000);
    await setLastClaimAt(previous);
    nftChain.receiptError = "receipt timed out";

    const { body } = await claim({});

    expect(body.code).toBe("chain_error");
    const held = await lastClaimAt();
    expect(held).not.toBeNull();
    expect(held!.getTime()).toBeGreaterThan(previous.getTime());
  });
});

// ---------------------------------------------------------------------------
// Spec error states: "A voter must be able to tell 'you're already a voter' from
// 'try again in a moment' from 'you don't qualify' from 'this council's setup is
// incomplete'."
// ---------------------------------------------------------------------------

describe("nft-claim refusal codes", () => {
  it("returns no_requirements on a council with no nft groups", async () => {
    await insertManualGroup("Manual");

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("no_requirements");
    expect(nftChain.writes).toEqual([]);
  });

  it("returns bot_missing_role when the bot cannot add voters", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    nftChain.botHasRole = false;

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("bot_missing_role");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
  });

  it("returns not_eligible when no requirement is met", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({ address: NON_HOLDER });

    expect(body.success).toBe(false);
    expect(body.code).toBe("not_eligible");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
  });

  // Spec: "A read failure must never be presented as 'you don't qualify'."
  it("returns check_unavailable when every requirement read failed", async () => {
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
    failRead(COLLECTION_721, "balanceOf");
    failRead(COLLECTION_1155, "balanceOf");

    const { body } = await claim({});

    expect(body.success).toBe(false);
    expect(body.code).toBe("check_unavailable");
    expect(body.code).not.toBe("not_eligible");
    expect(nftChain.writes).toEqual([]);
    expect(await allMembershipRows()).toEqual([]);
  });

  it("returns chain_error without echoing the raw provider error", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });
    nftChain.writeError = RPC_ERROR_MESSAGE;

    const { text, body } = await claim({});

    expect(body.code).toBe("chain_error");
    expect(text).not.toContain(RPC_ERROR_SENTINEL);
    expect(text).not.toContain("provider.internal");
  });

  it("returns 400 for a body that is not JSON, not the outer catch's 500", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const res = await claimPost(
      new Request(CLAIM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(nftChain.writes).toEqual([]);
  });

  it("rejects a malformed claiming address", async () => {
    await insertNftGroup({ name: "Core", defaultVotingPower: 20 });

    const { body } = await claim({ address: "0xnope" });

    expect(body.success).toBe(false);
    expect(nftChain.writes).toEqual([]);
  });

  it("rejects an unknown council", async () => {
    const { body } = await claim({ councilId: address("dead") });

    expect(body.success).toBe(false);
    expect(nftChain.writes).toEqual([]);
  });

  it("makes every refusal reachable and distinguishable", async () => {
    const codes = new Set<string>();

    await insertManualGroup("Manual");
    codes.add((await claim({})).body.code);

    await insertNftGroup({
      name: "Core",
      contractAddress: COLLECTION_721,
      defaultVotingPower: 20,
    });

    councilIndexedRef.current = false;
    codes.add((await claim({})).body.code);
    councilIndexedRef.current = true;

    codes.add((await claim({ signature: BAD_SIGNATURE })).body.code);
    codes.add((await claim({ issuedAt: Date.now() - 10 * 60_000 })).body.code);
    codes.add((await claim({ address: NON_HOLDER })).body.code);

    failRead(COLLECTION_721, "balanceOf");
    codes.add((await claim({})).body.code);
    nftChain.failReads.clear();

    nftChain.botHasRole = false;
    codes.add((await claim({})).body.code);
    nftChain.botHasRole = true;

    nftChain.writeError = "boom";
    codes.add((await claim({})).body.code);
    nftChain.writeError = null;

    await setLastClaimAt(new Date());
    codes.add((await claim({})).body.code);

    await setLastClaimAt(null);
    // At or above every tier: below the 20-vote tier this would be an upgrade.
    setVotingPower(HOLDER, 30n);
    codes.add((await claim({})).body.code);

    expect(codes).toEqual(
      new Set([
        "no_requirements",
        "invalid_signature",
        "expired_signature",
        "not_eligible",
        "check_unavailable",
        "bot_missing_role",
        "chain_error",
        "rate_limited",
        "already_voter",
        "council_unverified",
      ]),
    );
  });
});
