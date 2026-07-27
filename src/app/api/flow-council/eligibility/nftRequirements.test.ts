import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../metrics/lib", () => ({ getCouncilPublicClient: vi.fn() }));

import { evaluateNftRequirements, selectWinner } from "./nftRequirements";
import { getCouncilPublicClient } from "../metrics/lib";
import { networks } from "@/lib/networks";

// Spec (Overlapping eligibility): "When a wallet holds NFTs matching more than one of
//   the council's groups, it lands in the one granting the most votes. Ties break toward
//   the group created first."
// Spec (Overlapping eligibility): "'Has votes' means voting power on-chain, not a
//   membership record in our database … On-chain is the authority."
// Spec (Error states): "Chain read fails while checking a requirement: that row shows
//   'couldn't check right now, try again' rather than a false negative. A read failure
//   must never be presented as 'you don't qualify'."
// Spec (External dependencies): "All of a council's checks are batched into a single
//   request per popup open."

const NETWORK = networks.find((n) => n.label === "optimism-sepolia")!;
const COUNCIL = "0x9999999999999999999999999999999999999999";
const WALLET = "0x5678000000000000000000000000000000000001";

const CORE_COLLECTION = "0x1111111111111111111111111111111111111111";
const COMMUNITY_COLLECTION = "0x2222222222222222222222222222222222222222";
const EDITIONS_COLLECTION = "0x3333333333333333333333333333333333333333";

type Requirement = {
  id: number;
  name: string;
  defaultVotingPower: number;
  nftContractAddress: string;
  nftTokenStandard: "erc721" | "erc1155";
  nftTokenId: string | null;
};

const CORE: Requirement = {
  id: 1,
  name: "Hold the Core Contributor NFT",
  defaultVotingPower: 20,
  nftContractAddress: CORE_COLLECTION,
  nftTokenStandard: "erc721",
  nftTokenId: null,
};

const COMMUNITY: Requirement = {
  id: 2,
  name: "Hold the Community NFT",
  defaultVotingPower: 5,
  nftContractAddress: COMMUNITY_COLLECTION,
  nftTokenStandard: "erc721",
  nftTokenId: null,
};

const EDITIONS: Requirement = {
  id: 3,
  name: "Hold Edition 42",
  defaultVotingPower: 10,
  nftContractAddress: EDITIONS_COLLECTION,
  nftTokenStandard: "erc1155",
  nftTokenId: "42",
};

type MulticallEntry =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

type ContractCall = {
  address: string;
  functionName: string;
  args?: readonly unknown[];
};

const ok = (result: unknown): MulticallEntry => ({ status: "success", result });

const failure = (error: unknown): MulticallEntry => ({
  status: "failure",
  error,
});

const voterWithPower = (votingPower: bigint) =>
  ok({ account: WALLET, votingPower, votes: [] });

type ChainFixture = {
  voter?: MulticallEntry;
  hasRole?: MulticallEntry;
  balances?: Record<string, MulticallEntry>;
};

function fakeClient(fixture: ChainFixture) {
  const calls: ContractCall[] = [];

  const resolve = (call: ContractCall): MulticallEntry => {
    switch (call.functionName) {
      case "getVoter":
        return fixture.voter ?? voterWithPower(0n);
      case "hasRole":
        return fixture.hasRole ?? ok(true);
      case "balanceOf":
        return (
          fixture.balances?.[call.address.toLowerCase()] ??
          failure(new Error(`unstubbed balanceOf for ${call.address}`))
        );
      default:
        return failure(new Error(`unstubbed call ${call.functionName}`));
    }
  };

  const multicall = vi.fn(
    async ({
      contracts,
      allowFailure,
    }: {
      contracts: ContractCall[];
      allowFailure?: boolean;
    }) => {
      calls.push(...contracts);
      const entries = contracts.map(resolve);
      if (allowFailure === false) {
        const failed = entries.find((entry) => entry.status === "failure");
        if (failed && failed.status === "failure") throw failed.error;
        return entries.map((entry) =>
          entry.status === "success" ? entry.result : undefined,
        );
      }
      return entries;
    },
  );

  return { calls, multicall };
}

function useClient(fixture: ChainFixture) {
  const client = fakeClient(fixture);
  vi.mocked(getCouncilPublicClient).mockReturnValue(
    client as unknown as ReturnType<typeof getCouncilPublicClient>,
  );
  return client;
}

function evaluate(requirements: Requirement[]) {
  return evaluateNftRequirements({
    network: NETWORK,
    councilId: COUNCIL,
    address: WALLET,
    requirements,
  });
}

beforeEach(() => {
  vi.mocked(getCouncilPublicClient).mockReset();
});

// ---------------------------------------------------------------------------
// evaluateNftRequirements
// ---------------------------------------------------------------------------

describe("evaluateNftRequirements", () => {
  describe("holdings", () => {
    it("marks a requirement met when the wallet holds the collection (criterion 6)", async () => {
      useClient({ balances: { [CORE_COLLECTION]: ok(1n) } });

      const result = await evaluate([CORE]);

      expect(result.rows).toEqual([
        {
          groupId: 1,
          name: "Hold the Core Contributor NFT",
          votes: 20,
          status: "met",
        },
      ]);
    });

    it("marks a requirement unmet when the wallet holds none of the collection (criterion 8)", async () => {
      useClient({ balances: { [CORE_COLLECTION]: ok(0n) } });

      const result = await evaluate([CORE]);

      expect(result.rows[0].status).toBe("unmet");
    });

    it("marks a requirement met on any positive balance, since holding one is the same as holding fifty", async () => {
      useClient({ balances: { [CORE_COLLECTION]: ok(50n) } });

      const result = await evaluate([CORE]);

      expect(result.rows[0].status).toBe("met");
    });

    it("passes only the holder address to an ERC-721 balanceOf", async () => {
      const client = useClient({ balances: { [CORE_COLLECTION]: ok(1n) } });

      await evaluate([CORE]);

      const call = client.calls.find(
        (c) => c.address.toLowerCase() === CORE_COLLECTION,
      );
      expect(call?.functionName).toBe("balanceOf");
      expect(call?.args).toEqual([WALLET]);
    });

    it("passes the token id to an ERC-1155 balanceOf as a bigint", async () => {
      const client = useClient({ balances: { [EDITIONS_COLLECTION]: ok(1n) } });

      await evaluate([EDITIONS]);

      const call = client.calls.find(
        (c) => c.address.toLowerCase() === EDITIONS_COLLECTION,
      );
      expect(call?.args).toEqual([WALLET, 42n]);
    });

    it("returns one row per requirement, in requirement order, carrying the label and allocation (criterion 12)", async () => {
      useClient({
        balances: {
          [CORE_COLLECTION]: ok(1n),
          [COMMUNITY_COLLECTION]: ok(0n),
          [EDITIONS_COLLECTION]: ok(1n),
        },
      });

      const result = await evaluate([CORE, COMMUNITY, EDITIONS]);

      expect(result.rows).toEqual([
        {
          groupId: 1,
          name: "Hold the Core Contributor NFT",
          votes: 20,
          status: "met",
        },
        {
          groupId: 2,
          name: "Hold the Community NFT",
          votes: 5,
          status: "unmet",
        },
        { groupId: 3, name: "Hold Edition 42", votes: 10, status: "met" },
      ]);
    });

    it("returns no rows for a council whose NFT groups were all deleted", async () => {
      useClient({});

      const result = await evaluate([]);

      expect(result.rows).toEqual([]);
    });

    it("batches every read into a single multicall", async () => {
      const client = useClient({
        balances: {
          [CORE_COLLECTION]: ok(1n),
          [COMMUNITY_COLLECTION]: ok(1n),
          [EDITIONS_COLLECTION]: ok(1n),
        },
      });

      await evaluate([CORE, COMMUNITY, EDITIONS]);

      expect(client.multicall).toHaveBeenCalledTimes(1);
    });
  });

  describe("on-chain voting power decides whether anything is claimable", () => {
    it("reports the wallet's on-chain voting power (criterion 10)", async () => {
      useClient({
        voter: voterWithPower(20n),
        balances: { [CORE_COLLECTION]: ok(1n) },
      });

      const result = await evaluate([CORE]);

      expect(result.votingPower).toBe(20n);
    });

    it("reports zero voting power for a voter an admin zeroed out, whose row still exists (criterion 11)", async () => {
      useClient({
        voter: ok({ account: WALLET, votingPower: 0n, votes: [] }),
        balances: { [CORE_COLLECTION]: ok(1n) },
      });

      const result = await evaluate([CORE]);

      expect(result.votingPower).toBe(0n);
      expect(result.rows[0].status).toBe("met");
    });

    it("reports null voting power when the getVoter read fails, so a failed read is never taken for 'no votes'", async () => {
      useClient({
        voter: failure(new Error("execution reverted")),
        balances: { [CORE_COLLECTION]: ok(1n) },
      });

      const result = await evaluate([CORE]);

      expect(result.votingPower).toBeNull();
    });
  });

  describe("bot permission", () => {
    it("reports botHasRole true when the bot holds the voter-manager role", async () => {
      useClient({ hasRole: ok(true), balances: { [CORE_COLLECTION]: ok(1n) } });

      const result = await evaluate([CORE]);

      expect(result.botHasRole).toBe(true);
    });

    it("reports botHasRole false when the council never granted it, without hiding the requirement rows", async () => {
      useClient({
        hasRole: ok(false),
        balances: { [CORE_COLLECTION]: ok(1n) },
      });

      const result = await evaluate([CORE]);

      expect(result.botHasRole).toBe(false);
      expect(result.rows).toHaveLength(1);
    });

    it("reports null botHasRole when the role read fails", async () => {
      useClient({
        hasRole: failure(new Error("execution reverted")),
        balances: { [CORE_COLLECTION]: ok(1n) },
      });

      const result = await evaluate([CORE]);

      expect(result.botHasRole).toBeNull();
    });
  });

  describe("a failed read is never a false negative", () => {
    it("degrades exactly one row to unknown when a single balance read fails, leaving the others intact", async () => {
      useClient({
        balances: {
          [CORE_COLLECTION]: ok(1n),
          [COMMUNITY_COLLECTION]: failure(new Error("execution reverted")),
          [EDITIONS_COLLECTION]: ok(0n),
        },
      });

      const result = await evaluate([CORE, COMMUNITY, EDITIONS]);

      expect(result.rows.map((row) => row.status)).toEqual([
        "met",
        "unknown",
        "unmet",
      ]);
    });

    it("marks a row unknown rather than unmet when its own read fails", async () => {
      useClient({
        balances: { [CORE_COLLECTION]: failure(new Error("HTTP 503")) },
      });

      const result = await evaluate([CORE]);

      expect(result.rows[0].status).toBe("unknown");
    });

    it("keeps every row unknown when the whole batch fails", async () => {
      useClient({
        balances: {
          [CORE_COLLECTION]: failure(new Error("HTTP 503")),
          [COMMUNITY_COLLECTION]: failure(new Error("HTTP 503")),
        },
      });

      const result = await evaluate([CORE, COMMUNITY]);

      expect(result.rows.map((row) => row.status)).toEqual([
        "unknown",
        "unknown",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// selectWinner
// ---------------------------------------------------------------------------

// Spec: "it lands in the one granting the most votes. Ties break toward the group
//   created first", meaning the group with the lowest id.

describe("selectWinner", () => {
  const row = (
    groupId: number,
    status: "met" | "unmet" | "unknown",
    votes: number,
  ) => ({ groupId, name: `Group ${groupId}`, votes, status });

  it("picks the highest allocation across three met rows (criterion 9)", () => {
    const requirements = [CORE, COMMUNITY, EDITIONS];
    const rows = [row(1, "met", 20), row(2, "met", 5), row(3, "met", 10)];

    expect(selectWinner(rows, requirements)?.id).toBe(1);
    expect(selectWinner(rows, requirements)?.defaultVotingPower).toBe(20);
  });

  it("breaks a tie toward the lowest group id, the group created first", () => {
    const first = { ...COMMUNITY, id: 2, defaultVotingPower: 10 };
    const second = { ...EDITIONS, id: 3, defaultVotingPower: 10 };
    const rows = [row(2, "met", 10), row(3, "met", 10)];

    expect(selectWinner(rows, [first, second])?.id).toBe(2);
  });

  it("breaks a tie toward the lowest group id regardless of row order", () => {
    const first = { ...COMMUNITY, id: 2, defaultVotingPower: 10 };
    const second = { ...EDITIONS, id: 3, defaultVotingPower: 10 };
    const rows = [row(3, "met", 10), row(2, "met", 10)];

    expect(selectWinner(rows, [second, first])?.id).toBe(2);
  });

  it("ignores an unmet row even when it carries the largest allocation (criterion 8)", () => {
    const rows = [row(1, "unmet", 20), row(2, "met", 5)];

    expect(selectWinner(rows, [CORE, COMMUNITY])?.id).toBe(2);
  });

  it("ignores an unknown row, which is unresolved rather than qualifying", () => {
    const rows = [row(1, "unknown", 20), row(2, "met", 5)];

    expect(selectWinner(rows, [CORE, COMMUNITY])?.id).toBe(2);
  });

  it("returns null when no row is met", () => {
    const rows = [row(1, "unmet", 20), row(2, "unknown", 5)];

    expect(selectWinner(rows, [CORE, COMMUNITY])).toBeNull();
  });

  it("returns null for an empty row list", () => {
    expect(selectWinner([], [])).toBeNull();
  });
});
