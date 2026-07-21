import { describe, it, expect } from "vitest";
import {
  voterGroupCreateSchema,
  voterGroupUpdateSchema,
  nftConfigSchema,
} from "./validation";

// Spec: POST /api/flow-council/voter-groups body validation
// Impl-plan Task 2: "Validate with Zod: name 1–100 chars, eligibilityMethod enum
//   ['manual','gooddollar'], defaultVotingPower integer 1–1e6"
// Spec: PATCH — partial update; each field still validated when present
// Spec (NFT voter groups): "an admin can pick 'NFT Holder' as the eligibility method
//   alongside Manual, GoodDollar, and Metrics … For ERC-1155 collections they also
//   specify which token ID counts."

const ERC721_CONFIG = {
  contractAddress: "0x1111111111111111111111111111111111111111",
  tokenStandard: "erc721" as const,
};

const ERC1155_CONFIG = {
  contractAddress: "0x2222222222222222222222222222222222222222",
  tokenStandard: "erc1155" as const,
  tokenId: "42",
};

const MAX_UINT256 = (2n ** 256n - 1n).toString();
const TWO_POW_256 = (2n ** 256n).toString();

// ---------------------------------------------------------------------------
// voterGroupCreateSchema
// ---------------------------------------------------------------------------

describe("voterGroupCreateSchema", () => {
  const validPayload = {
    name: "GoodDollar Holders",
    eligibilityMethod: "manual" as const,
    defaultVotingPower: 10,
  };

  describe("happy path", () => {
    it("accepts a minimal valid payload", () => {
      expect(voterGroupCreateSchema.safeParse(validPayload).success).toBe(true);
    });

    it("accepts eligibilityMethod 'gooddollar'", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "gooddollar",
      });
      expect(result.success).toBe(true);
    });

    it("accepts eligibilityMethod 'nft' with an ERC-721 config (criterion 1)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "nft",
        nft: ERC721_CONFIG,
      });
      expect(result.success).toBe(true);
    });

    it("accepts eligibilityMethod 'nft' with an ERC-1155 config carrying a token id (criterion 2)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "nft",
        nft: ERC1155_CONFIG,
      });
      expect(result.success).toBe(true);
    });

    it("accepts defaultVotingPower of 1 (minimum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts defaultVotingPower of 1_000_000 (maximum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a name of exactly 1 character (minimum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "A",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a name of exactly 100 characters (maximum boundary)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("name validation", () => {
    it("rejects an empty name", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a name of 101 characters (one over the maximum)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        name: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing name field", () => {
      const rest = {
        eligibilityMethod: validPayload.eligibilityMethod,
        defaultVotingPower: validPayload.defaultVotingPower,
      };
      const result = voterGroupCreateSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("eligibilityMethod validation", () => {
    it("rejects an unknown eligibility method string", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "poap",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'NFT' (wrong casing)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "NFT",
        nft: ERC721_CONFIG,
      });
      expect(result.success).toBe(false);
    });

    it("rejects an empty string for eligibilityMethod", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'GoodDollar' (wrong casing)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "GoodDollar",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'Manual' (wrong casing)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "Manual",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing eligibilityMethod field", () => {
      const rest = {
        name: validPayload.name,
        defaultVotingPower: validPayload.defaultVotingPower,
      };
      const result = voterGroupCreateSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("defaultVotingPower validation", () => {
    it("rejects 0 (below minimum of 1)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a negative value", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects 1_000_001 (above maximum of 1_000_000)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1_000_001,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer float (1.5)", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a string representation of a number", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        defaultVotingPower: "10",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing defaultVotingPower field", () => {
      const rest = {
        name: validPayload.name,
        eligibilityMethod: validPayload.eligibilityMethod,
      };
      const result = voterGroupCreateSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // Spec: an NFT group is defined by its collection; a group without one matches
  // nobody (criterion 4). The config travels as one whole object, never per-field.
  describe("nft config presence", () => {
    it("rejects eligibilityMethod 'nft' with no nft config at all", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "nft",
      });
      expect(result.success).toBe(false);
    });

    it("rejects eligibilityMethod 'nft' with an incomplete nft config", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "nft",
        nft: { contractAddress: ERC721_CONFIG.contractAddress },
      });
      expect(result.success).toBe(false);
    });

    it("rejects an nft config on a manual group", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "manual",
        nft: ERC721_CONFIG,
      });
      expect(result.success).toBe(false);
    });

    it("rejects an nft config on a gooddollar group", () => {
      const result = voterGroupCreateSchema.safeParse({
        ...validPayload,
        eligibilityMethod: "gooddollar",
        nft: ERC721_CONFIG,
      });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// voterGroupUpdateSchema
// ---------------------------------------------------------------------------

// Spec: PATCH — partial update; all three fields optional but still validated when present

describe("voterGroupUpdateSchema", () => {
  describe("happy path", () => {
    it("accepts an empty object (all fields optional)", () => {
      expect(voterGroupUpdateSchema.safeParse({}).success).toBe(true);
    });

    it("accepts name-only update", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ name: "Renamed" }).success,
      ).toBe(true);
    });

    it("accepts eligibilityMethod-only update to 'gooddollar'", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "gooddollar" })
          .success,
      ).toBe(true);
    });

    it("accepts eligibilityMethod-only update to 'manual'", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "manual" })
          .success,
      ).toBe(true);
    });

    it("accepts defaultVotingPower-only update", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 50 }).success,
      ).toBe(true);
    });

    it("accepts all three fields together", () => {
      expect(
        voterGroupUpdateSchema.safeParse({
          name: "Updated",
          eligibilityMethod: "gooddollar",
          defaultVotingPower: 100,
        }).success,
      ).toBe(true);
    });
  });

  describe("name still validated when present", () => {
    it("rejects empty name when name is provided", () => {
      expect(voterGroupUpdateSchema.safeParse({ name: "" }).success).toBe(
        false,
      );
    });

    it("rejects name longer than 100 chars when name is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ name: "x".repeat(101) }).success,
      ).toBe(false);
    });
  });

  describe("eligibilityMethod still validated when present", () => {
    it("rejects unknown method when eligibilityMethod is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "poap" }).success,
      ).toBe(false);
    });

    it("accepts eligibilityMethod 'nft' with a whole nft config", () => {
      expect(
        voterGroupUpdateSchema.safeParse({
          eligibilityMethod: "nft",
          nft: ERC1155_CONFIG,
        }).success,
      ).toBe(true);
    });

    // Whether the resulting group ends up as "nft" depends on the stored row, so
    // config completeness is the route's job; the schema only shapes what arrives.
    it("accepts eligibilityMethod 'nft' without an nft config", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ eligibilityMethod: "nft" }).success,
      ).toBe(true);
    });
  });

  // Spec (editing an NFT group): "the contract address, token ID, vote allocation,
  // label, and link can all be changed at any time", but never one NFT field at a
  // time, which is what leaves a group matching nobody (criterion 4).
  describe("nft config is optional as a whole object, never per-field", () => {
    it("accepts an update carrying no nft config", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 25 }).success,
      ).toBe(true);
    });

    it("accepts an update carrying a complete nft config", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ nft: ERC721_CONFIG }).success,
      ).toBe(true);
    });

    it("rejects an update carrying only a contract address (criterion 4)", () => {
      expect(
        voterGroupUpdateSchema.safeParse({
          nft: { contractAddress: ERC721_CONFIG.contractAddress },
        }).success,
      ).toBe(false);
    });

    it("rejects an update carrying only a token standard (criterion 4)", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ nft: { tokenStandard: "erc1155" } })
          .success,
      ).toBe(false);
    });

    it("rejects an update switching to erc1155 without a token id (criterion 4)", () => {
      expect(
        voterGroupUpdateSchema.safeParse({
          nft: {
            contractAddress: ERC1155_CONFIG.contractAddress,
            tokenStandard: "erc1155",
          },
        }).success,
      ).toBe(false);
    });
  });

  describe("defaultVotingPower still validated when present", () => {
    it("rejects 0 when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 0 }).success,
      ).toBe(false);
    });

    it("rejects a negative value when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: -5 }).success,
      ).toBe(false);
    });

    it("rejects 1_000_001 when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 1_000_001 })
          .success,
      ).toBe(false);
    });

    it("rejects a non-integer when defaultVotingPower is provided", () => {
      expect(
        voterGroupUpdateSchema.safeParse({ defaultVotingPower: 2.5 }).success,
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// nftConfigSchema
// ---------------------------------------------------------------------------

// Spec: "They enter the collection's contract address … If it's an ERC-1155, a token
//   ID field appears and is required … an optional 'where to get this NFT' link."
// Spec (Out of scope): "Multiple tiers on a single ERC-721 collection". A 721 group
//   has no token ID to distinguish it, so carrying one is a configuration error.

describe("nftConfigSchema", () => {
  describe("token standard and token id", () => {
    it("accepts an erc721 config with no token id", () => {
      expect(nftConfigSchema.safeParse(ERC721_CONFIG).success).toBe(true);
    });

    it("accepts an erc1155 config with a token id (criterion 2)", () => {
      expect(nftConfigSchema.safeParse(ERC1155_CONFIG).success).toBe(true);
    });

    it("rejects an erc1155 config with no token id (criterion 4)", () => {
      const result = nftConfigSchema.safeParse({
        contractAddress: ERC1155_CONFIG.contractAddress,
        tokenStandard: "erc1155",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an erc721 config that carries a token id (criterion 4)", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        tokenId: "1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown token standard", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        tokenStandard: "erc20",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a mis-cased token standard", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        tokenStandard: "ERC721",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing token standard", () => {
      const result = nftConfigSchema.safeParse({
        contractAddress: ERC721_CONFIG.contractAddress,
      });
      expect(result.success).toBe(false);
    });
  });

  // The token id is stored as a canonical decimal string and is half of the
  // (council, collection, token id) uniqueness rule, so "007" and "7" must not
  // both be storable.
  describe("token id canonical form", () => {
    it("accepts token id 0", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: "0",
      });
      expect(result.success).toBe(true);
    });

    it("accepts the largest uint256 token id", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: MAX_UINT256,
      });
      expect(result.success).toBe(true);
    });

    it("rejects a token id of 2^256, which no uint256 can hold", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: TWO_POW_256,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a leading-zero token id", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: "007",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a hex token id", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: "0x2a",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a negative token id", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: "-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a numeric token id, since uint256 does not survive a JS number", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC1155_CONFIG,
        tokenId: 42,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("contract address", () => {
    it("lowercases a mixed-case contract address so the duplicate rule cannot be bypassed", () => {
      const checksummed = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        contractAddress: checksummed,
      });

      expect(result.success).toBe(true);
      expect(result.success ? result.data.contractAddress : null).toBe(
        checksummed.toLowerCase(),
      );
    });

    it("rejects a non-address string", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        contractAddress: "flowstaters.eth",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a truncated address", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        contractAddress: "0x1111",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a missing contract address", () => {
      const result = nftConfigSchema.safeParse({ tokenStandard: "erc721" });
      expect(result.success).toBe(false);
    });
  });

  describe("acquisition url", () => {
    it("accepts an https link", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        acquisitionUrl: "https://example.org/mint",
      });
      expect(result.success).toBe(true);
    });

    it("accepts an http link", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        acquisitionUrl: "http://example.org/mint",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a config with no acquisition url, since the link is optional", () => {
      expect(nftConfigSchema.safeParse(ERC721_CONFIG).success).toBe(true);
    });

    it("rejects a javascript: url", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        acquisitionUrl: "javascript:alert(1)",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an ipfs: url", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        acquisitionUrl: "ipfs://bafybeigdyrzt",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a url that is not a url at all", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        acquisitionUrl: "example.org/mint",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("collection name", () => {
    it("accepts a collection name of exactly 100 characters", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        collectionName: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("rejects a collection name of 101 characters", () => {
      const result = nftConfigSchema.safeParse({
        ...ERC721_CONFIG,
        collectionName: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });
});
