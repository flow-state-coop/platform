import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

// Task 4 of .claude/specs/nft-voter-group-impl-plan.md. The route does not
// exist yet; these tests define its contract.
//
//   POST /api/flow-council/voter-groups/nft-probe
//   body:     { chainId, councilId, contractAddress, overrideStandard? }
//   response: { success: true, status, standard?, collectionName?, message }
//             plus { overrideOk, overrideReason? } when overrideStandard is set
//   statuses: detected | no_contract | no_erc165 | unsupported_interface
//             | unreliable_erc165 | read_failed

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

import { getAddress } from "viem";
import { POST as probePost } from "./route";
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
import {
  failRead,
  resetNftChain,
  setContract,
  RPC_ERROR_SENTINEL,
} from "@tests/helpers/nftChain";

const db = getTestDb();

const PROBE = "http://localhost/api/flow-council/voter-groups/nft-probe";

function address(suffix: string): string {
  return `0x${suffix.padStart(40, "0")}`;
}

const COLLECTION_721 = address("beef721");
const COLLECTION_1155 = address("beef1155");
const TOKEN_ERC20 = address("dec1a5");
const LEGACY_721 = address("01d721");
const OTHER_165 = address("165");
const BROKEN_165 = address("bad165");
const EOA_ADDRESS = address("e0a");

const base = { chainId: TEST_CHAIN_ID, councilId: TEST_COUNCIL_ADDRESS };

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  await seedTestData(db);
  resetNftChain();
  setContract(COLLECTION_721, { kind: "erc721", name: "Flowstaters" });
  setContract(COLLECTION_1155, { kind: "erc1155", name: "Community Pass" });
  setContract(TOKEN_ERC20, { kind: "erc20", name: "Some Token" });
  setContract(LEGACY_721, { kind: "pre165Erc721", name: "Cryptopunk-era" });
  setContract(OTHER_165, { kind: "erc165Other", name: "Registry" });
  setContract(BROKEN_165, { kind: "broken165" });
  setContract(EOA_ADDRESS, { kind: "eoa" });
  mockSession(TEST_ADMIN_ADDRESS);
});

function probeRequest(body: unknown) {
  return new Request(PROBE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function probe(body: Record<string, unknown>) {
  const res = await probePost(probeRequest({ ...base, ...body }));
  const text = await res.text();
  return { res, text, body: JSON.parse(text) };
}

// ---------------------------------------------------------------------------
// Authorization: the probe is an RPC amplifier, so it is manager-gated.
// ---------------------------------------------------------------------------

describe("nft-probe authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    mockUnauthenticated();
    const { res, body } = await probe({ contractAddress: COLLECTION_721 });

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthenticated");
  });

  it("rejects a caller with no managing role on the council", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const { res, body } = await probe({ contractAddress: COLLECTION_721 });

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Not authorized to manage this council");
  });

  it("rejects an unknown council", async () => {
    const { res, body } = await probe({
      councilId: address("dead"),
      contractAddress: COLLECTION_721,
    });

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("rejects a contract address that is not an address", async () => {
    const { res, body } = await probe({ contractAddress: "not-an-address" });

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Detection. Spec behavior: "We check the address and show what we found."
// ---------------------------------------------------------------------------

describe("nft-probe detection", () => {
  it("detects an ERC-721 collection and its name", async () => {
    const { body } = await probe({ contractAddress: COLLECTION_721 });

    expect(body.success).toBe(true);
    expect(body.status).toBe("detected");
    expect(body.standard).toBe("erc721");
    expect(body.collectionName).toBe("Flowstaters");
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("detects an ERC-1155 collection", async () => {
    const { body } = await probe({ contractAddress: COLLECTION_1155 });

    expect(body.success).toBe(true);
    expect(body.status).toBe("detected");
    expect(body.standard).toBe("erc1155");
    expect(body.collectionName).toBe("Community Pass");
  });

  it("accepts a checksummed contract address", async () => {
    const { body } = await probe({
      contractAddress: getAddress(COLLECTION_721),
    });

    expect(body.status).toBe("detected");
    expect(body.standard).toBe("erc721");
  });

  it("reports no_contract for an address with no bytecode", async () => {
    const { body } = await probe({ contractAddress: EOA_ADDRESS });

    expect(body.success).toBe(true);
    expect(body.status).toBe("no_contract");
    expect(body.standard).toBeUndefined();
  });

  it("reports no_erc165 for a contract that does not advertise a standard", async () => {
    const { body } = await probe({ contractAddress: TOKEN_ERC20 });

    expect(body.success).toBe(true);
    expect(body.status).toBe("no_erc165");
    expect(body.standard).toBeUndefined();
  });

  it("reports unsupported_interface for a contract advertising neither standard", async () => {
    const { body } = await probe({ contractAddress: OTHER_165 });

    expect(body.success).toBe(true);
    expect(body.status).toBe("unsupported_interface");
    expect(body.standard).toBeUndefined();
  });

  it("reports unreliable_erc165 when the contract answers 0xffffffff true", async () => {
    const { body } = await probe({ contractAddress: BROKEN_165 });

    expect(body.success).toBe(true);
    expect(body.status).toBe("unreliable_erc165");
    expect(body.standard).toBeUndefined();
  });

  it("gives each detection status its own message", async () => {
    const statuses = [
      COLLECTION_721,
      EOA_ADDRESS,
      TOKEN_ERC20,
      OTHER_165,
      BROKEN_165,
    ];
    const messages: string[] = [];

    for (const contractAddress of statuses) {
      const { body } = await probe({ contractAddress });
      expect(typeof body.message).toBe("string");
      expect(body.message.length).toBeGreaterThan(0);
      messages.push(body.message);
    }

    expect(new Set(messages).size).toBe(messages.length);
  });
});

// ---------------------------------------------------------------------------
// Manual override probe. Spec constraint: the override covers older pre-ERC-165
// collections, but an ordinary token contract is never accepted (criterion 3).
// ---------------------------------------------------------------------------

describe("nft-probe manual override", () => {
  const LOOKS_LIKE_TOKEN_ERROR =
    "This looks like a token contract, not an NFT collection.";

  it("rejects an ERC-20 under an erc721 override", async () => {
    const { body } = await probe({
      contractAddress: TOKEN_ERC20,
      overrideStandard: "erc721",
    });

    expect(body.success).toBe(true);
    expect(body.overrideOk).toBe(false);
    expect(body.overrideReason).toBe("looks_like_token");
    expect(body.message).toBe(LOOKS_LIKE_TOKEN_ERROR);
  });

  it("rejects an ERC-20 under an erc1155 override", async () => {
    const { body } = await probe({
      contractAddress: TOKEN_ERC20,
      overrideStandard: "erc1155",
    });

    expect(body.overrideOk).toBe(false);
    expect(body.overrideReason).toBe("looks_like_token");
    expect(body.message).toBe(LOOKS_LIKE_TOKEN_ERROR);
  });

  it("accepts a pre-ERC-165 collection under an erc721 override", async () => {
    const { body } = await probe({
      contractAddress: LEGACY_721,
      overrideStandard: "erc721",
    });

    expect(body.success).toBe(true);
    expect(body.status).toBe("no_erc165");
    expect(body.overrideOk).toBe(true);
  });

  it("rejects an erc1155 override on a contract with no two-arg balanceOf", async () => {
    const { body } = await probe({
      contractAddress: LEGACY_721,
      overrideStandard: "erc1155",
    });

    expect(body.overrideOk).toBe(false);
    expect(body.overrideReason).toBe("missing_interface");
  });
});

// ---------------------------------------------------------------------------
// Error hygiene. Spec: never surface raw RPC/contract errors to the client.
// ---------------------------------------------------------------------------

describe("nft-probe error hygiene", () => {
  it("maps an RPC failure to read_failed without echoing the raw error", async () => {
    failRead(COLLECTION_721, "getCode");

    const { res, text, body } = await probe({
      contractAddress: COLLECTION_721,
    });

    expect(res.status).toBe(200);
    expect(body.status).toBe("read_failed");
    expect(typeof body.message).toBe("string");
    expect(text).not.toContain(RPC_ERROR_SENTINEL);
    expect(text).not.toContain("provider.internal");
  });

  it("never echoes the raw error when the interface reads fail", async () => {
    failRead(COLLECTION_721, "supportsInterface");

    const { text, body } = await probe({ contractAddress: COLLECTION_721 });

    expect(body.success).toBe(true);
    expect(text).not.toContain(RPC_ERROR_SENTINEL);
    expect(text).not.toContain("provider.internal");
  });
});

// ---------------------------------------------------------------------------
// Malformed requests are the caller's mistake: 400, matching the eligibility
// routes, never the outer catch's 500.
// ---------------------------------------------------------------------------

describe("nft-probe malformed requests", () => {
  it("returns 400 for a body that is not JSON", async () => {
    const res = await probePost(
      new Request(PROBE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
