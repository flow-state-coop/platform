import { describe, it, expect, vi } from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
} from "viem";
import {
  detectNftStandard,
  verifyOverrideStandard,
  NFT_DETECTION_MESSAGES,
} from "./detect";

// Spec (Error states): "Address isn't a recognizable NFT contract: the admin gets a
//   specific reason rather than a generic failure. The four cases are: no contract found
//   at that address on this chain; the contract doesn't advertise a standard we can read;
//   the contract advertises neither 721 nor 1155; the contract's self-description is
//   unreliable. In the middle two cases they can override manually and proceed."
// Spec (Constraints): "A small number of older NFT collections don't advertise their
//   standard in a machine-readable way. The manual override covers them. We deliberately
//   do not guess, because guessing would let an ordinary token contract be mistaken for
//   an NFT collection and grant votes to every token holder."
// Spec success criterion 3: "Pasting an address that is not an NFT contract is rejected
//   at configuration time with a specific reason, and an ordinary (non-NFT) token
//   contract is never accepted as a collection."

const COLLECTION = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";
const CATCH_ALL_INTERFACE_ID = "0xffffffff";

type MulticallEntry =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

type ContractCall = {
  address: string;
  functionName: string;
  args?: readonly unknown[];
};

const ok = (result: unknown): MulticallEntry => ({
  status: "success",
  result,
});

const failure = (error: unknown): MulticallEntry => ({
  status: "failure",
  error,
});

// viem surfaces a revert and empty returndata as the same outer error type with
// different causes, and telling those two apart is the whole point of the 721
// override probe, so the fixtures reproduce viem's real wrapping.
function revertedError(functionName: string) {
  return new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: [],
      functionName,
      message: "execution reverted",
    }),
    { abi: [], functionName },
  );
}

function zeroDataError(functionName: string) {
  return new ContractFunctionExecutionError(
    new ContractFunctionZeroDataError({ functionName }),
    { abi: [], functionName },
  );
}

type Fixture = {
  code?: string | undefined;
  supportsInterface?: Record<string, MulticallEntry>;
  name?: MulticallEntry;
  decimals?: MulticallEntry;
  allowance?: MulticallEntry;
  ownerOf?: MulticallEntry;
  balanceOfHolder?: MulticallEntry;
  balanceOfHolderAndId?: MulticallEntry;
  multicallThrows?: unknown;
  getCodeThrows?: unknown;
};

function fakeClient(fixture: Fixture) {
  const calls: ContractCall[] = [];

  const resolve = (call: ContractCall): MulticallEntry => {
    switch (call.functionName) {
      case "supportsInterface": {
        const interfaceId = String(call.args?.[0] ?? "");
        return (
          fixture.supportsInterface?.[interfaceId] ??
          failure(revertedError("supportsInterface"))
        );
      }
      case "name":
        return fixture.name ?? failure(revertedError("name"));
      case "decimals":
        return fixture.decimals ?? failure(revertedError("decimals"));
      case "allowance":
        return fixture.allowance ?? failure(revertedError("allowance"));
      case "ownerOf":
        return fixture.ownerOf ?? failure(revertedError("ownerOf"));
      case "balanceOf":
        return call.args?.length === 2
          ? (fixture.balanceOfHolderAndId ??
              failure(revertedError("balanceOf")))
          : (fixture.balanceOfHolder ?? failure(revertedError("balanceOf")));
      default:
        return failure(revertedError(call.functionName));
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
      if (fixture.multicallThrows) throw fixture.multicallThrows;
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

  const getCode = vi.fn(async () => {
    if (fixture.getCodeThrows) throw fixture.getCodeThrows;
    return "code" in fixture ? fixture.code : "0x60806040";
  });

  return { calls, getCode, multicall };
}

type FakeClient = ReturnType<typeof fakeClient>;

const asDetectClient = (client: FakeClient) =>
  client as unknown as Parameters<typeof detectNftStandard>[0];

const asOverrideClient = (client: FakeClient) =>
  client as unknown as Parameters<typeof verifyOverrideStandard>[0];

const erc721Interfaces = {
  [ERC721_INTERFACE_ID]: ok(true),
  [ERC1155_INTERFACE_ID]: ok(false),
  [CATCH_ALL_INTERFACE_ID]: ok(false),
};

const erc1155Interfaces = {
  [ERC721_INTERFACE_ID]: ok(false),
  [ERC1155_INTERFACE_ID]: ok(true),
  [CATCH_ALL_INTERFACE_ID]: ok(false),
};

// ---------------------------------------------------------------------------
// detectNftStandard
// ---------------------------------------------------------------------------

describe("detectNftStandard", () => {
  describe("successful detection", () => {
    it("detects an ERC-721 collection and reports its name (criterion 1)", async () => {
      const client = fakeClient({
        supportsInterface: erc721Interfaces,
        name: ok("Flowstaters"),
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({
        status: "detected",
        standard: "erc721",
        collectionName: "Flowstaters",
      });
    });

    it("detects an ERC-1155 collection and reports its name (criterion 2)", async () => {
      const client = fakeClient({
        supportsInterface: erc1155Interfaces,
        name: ok("Flowstaters Editions"),
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({
        status: "detected",
        standard: "erc1155",
        collectionName: "Flowstaters Editions",
      });
    });

    it("still detects the standard when the collection exposes no name, since the label falls back to the address", async () => {
      const client = fakeClient({ supportsInterface: erc721Interfaces });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result.status).toBe("detected");
      expect(result).toMatchObject({ standard: "erc721" });
      expect(
        (result as { collectionName?: string }).collectionName,
      ).toBeUndefined();
    });
  });

  describe("no contract at the address", () => {
    it("reports no_contract for an address with no deployed code", async () => {
      const client = fakeClient({ code: "0x" });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "no_contract" });
    });

    it("reports no_contract when the code read resolves to undefined", async () => {
      const client = fakeClient({ code: undefined });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "no_contract" });
    });

    it("reads code before any contract call, so an EOA is never misreported as an unreadable contract", async () => {
      const client = fakeClient({ code: "0x" });

      await detectNftStandard(asDetectClient(client), COLLECTION);

      expect(client.getCode).toHaveBeenCalled();
      expect(client.multicall).not.toHaveBeenCalled();
    });
  });

  describe("contract exists but cannot be classified", () => {
    it("reports no_erc165 when every supportsInterface read fails", async () => {
      const client = fakeClient({});

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "no_erc165" });
    });

    it("reports unsupported_interface when the contract answers ERC-165 but advertises neither standard", async () => {
      const client = fakeClient({
        supportsInterface: {
          [ERC721_INTERFACE_ID]: ok(false),
          [ERC1155_INTERFACE_ID]: ok(false),
          [CATCH_ALL_INTERFACE_ID]: ok(false),
        },
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "unsupported_interface" });
    });

    it("reports unsupported_interface when both real interface ids answer false and only the liveness probe fails", async () => {
      const client = fakeClient({
        supportsInterface: {
          [ERC721_INTERFACE_ID]: ok(false),
          [ERC1155_INTERFACE_ID]: ok(false),
          [CATCH_ALL_INTERFACE_ID]: failure(revertedError("supportsInterface")),
        },
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "unsupported_interface" });
    });

    it("reports unreliable_erc165 when 0xffffffff answers true, even though the 721 id also answers true", async () => {
      const client = fakeClient({
        supportsInterface: {
          [ERC721_INTERFACE_ID]: ok(true),
          [ERC1155_INTERFACE_ID]: ok(false),
          [CATCH_ALL_INTERFACE_ID]: ok(true),
        },
        name: ok("Catch All"),
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "unreliable_erc165" });
    });

    it("reports unreliable_erc165 when 0xffffffff answers true and both real ids answer false", async () => {
      const client = fakeClient({
        supportsInterface: {
          [ERC721_INTERFACE_ID]: ok(false),
          [ERC1155_INTERFACE_ID]: ok(false),
          [CATCH_ALL_INTERFACE_ID]: ok(true),
        },
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "unreliable_erc165" });
    });

    it("never probes balanceOf, whose selector an ERC-20 shares (criterion 3)", async () => {
      const client = fakeClient({ decimals: ok(18), balanceOfHolder: ok(5n) });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result.status).not.toBe("detected");
      expect(
        client.calls.some((call) => call.functionName === "balanceOf"),
      ).toBe(false);
    });
  });

  describe("chain read failures", () => {
    it("reports read_failed when the code read throws", async () => {
      const client = fakeClient({
        getCodeThrows: new Error("HTTP request failed"),
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "read_failed" });
    });

    it("reports read_failed when the interface multicall throws, rather than no_erc165", async () => {
      const client = fakeClient({
        multicallThrows: new Error("HTTP request failed"),
      });

      const result = await detectNftStandard(
        asDetectClient(client),
        COLLECTION,
      );

      expect(result).toEqual({ status: "read_failed" });
    });
  });
});

// ---------------------------------------------------------------------------
// verifyOverrideStandard
// ---------------------------------------------------------------------------

// The manual override is the one path where the admin, not the chain, picks the
// standard. Detection failing is not permission to trust it: a plain ERC-20 lands
// in no_erc165, so an unverified override would grant votes to every token holder.

describe("verifyOverrideStandard", () => {
  const erc20Fixture: Fixture = {
    decimals: ok(18),
    allowance: ok(0n),
    balanceOfHolder: ok(1_000n),
  };

  it("rejects an ERC-20 under a 721 override because decimals() decodes (criterion 3)", async () => {
    const client = fakeClient(erc20Fixture);

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: false, reason: "looks_like_token" });
  });

  it("rejects an ERC-20 under a 1155 override because decimals() decodes (criterion 3)", async () => {
    const client = fakeClient(erc20Fixture);

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc1155",
    );

    expect(result).toEqual({ ok: false, reason: "looks_like_token" });
  });

  it("rejects a contract whose allowance() decodes even when decimals() reverts (criterion 3)", async () => {
    const client = fakeClient({
      allowance: ok(0n),
      balanceOfHolder: ok(1n),
      ownerOf: ok(OWNER),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: false, reason: "looks_like_token" });
  });

  it("accepts a pre-ERC-165 721 whose ownerOf reverts on a nonexistent token id", async () => {
    const client = fakeClient({
      balanceOfHolder: ok(0n),
      ownerOf: failure(revertedError("ownerOf")),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: true });
  });

  it("accepts a 721 whose ownerOf returns an owner", async () => {
    const client = fakeClient({ balanceOfHolder: ok(3n), ownerOf: ok(OWNER) });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: true });
  });

  it("rejects a 721 override when ownerOf returns zero data, which proves the function does not exist", async () => {
    const client = fakeClient({
      balanceOfHolder: ok(0n),
      ownerOf: failure(zeroDataError("ownerOf")),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: false, reason: "missing_interface" });
  });

  // A contract with no fallback reverts on every unknown selector, so a revert
  // is not evidence the function exists. Only a decoding balance read is, and
  // without it the group would match nobody and show every voter "unknown".
  it("rejects a 721 override on a contract whose balanceOf does not decode, such as a Safe", async () => {
    const client = fakeClient({
      balanceOfHolder: failure(revertedError("balanceOf")),
      ownerOf: failure(revertedError("ownerOf")),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: false, reason: "missing_interface" });
  });

  it("reports read_failed rather than missing_interface when the probe cannot reach the chain", async () => {
    const client = fakeClient({
      multicallThrows: new Error("HTTP request failed"),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc721",
    );

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("accepts a 1155 on a clean two-argument balanceOf decode", async () => {
    const client = fakeClient({ balanceOfHolderAndId: ok(0n) });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc1155",
    );

    expect(result).toEqual({ ok: true });
  });

  it("rejects a 1155 override when the two-argument balanceOf returns zero data", async () => {
    const client = fakeClient({
      balanceOfHolderAndId: failure(zeroDataError("balanceOf")),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc1155",
    );

    expect(result).toEqual({ ok: false, reason: "missing_interface" });
  });

  it("rejects a 1155 override on a contract that only exposes the one-argument ERC-20 balanceOf (criterion 3)", async () => {
    const client = fakeClient({
      balanceOfHolder: ok(1_000n),
      balanceOfHolderAndId: failure(zeroDataError("balanceOf")),
    });

    const result = await verifyOverrideStandard(
      asOverrideClient(client),
      COLLECTION,
      "erc1155",
    );

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NFT_DETECTION_MESSAGES
// ---------------------------------------------------------------------------

describe("NFT_DETECTION_MESSAGES", () => {
  const failureStatuses = [
    "no_contract",
    "no_erc165",
    "unsupported_interface",
    "unreliable_erc165",
    "read_failed",
  ] as const;

  it("carries a non-empty message for every failure status", () => {
    for (const status of failureStatuses) {
      expect(NFT_DETECTION_MESSAGES[status]).toBeTruthy();
    }
  });

  it("gives each failure status its own message, so the admin sees a specific reason", () => {
    const messages = failureStatuses.map(
      (status) => NFT_DETECTION_MESSAGES[status],
    );

    expect(new Set(messages).size).toBe(failureStatuses.length);
  });

  it("explains a rejected token contract in the override copy", () => {
    expect(NFT_DETECTION_MESSAGES.looks_like_token).toBe(
      "This looks like a token contract, not an NFT collection.",
    );
  });
});
