import { describe, expect, it } from "vitest";
import {
  networks,
  isSplitterFactoryDeployed,
  getViemChain,
} from "./networks";

describe("isSplitterFactoryDeployed", () => {
  it("returns false for undefined network", () => {
    expect(isSplitterFactoryDeployed(undefined)).toBe(false);
  });

  it('returns false for the "0x" sentinel', () => {
    const network = networks.find((n) => n.label === "celo");
    expect(network?.superAppSplitterFactory).toBe("0x");
    expect(isSplitterFactoryDeployed(network)).toBe(false);
  });

  it("returns false for the zero address", () => {
    const network = {
      ...networks[0],
      superAppSplitterFactory:
        "0x0000000000000000000000000000000000000000" as const,
    };
    expect(isSplitterFactoryDeployed(network)).toBe(false);
  });

  it("returns true for a real factory address", () => {
    const network = networks.find((n) => n.label === "optimism-sepolia");
    expect(network?.superAppSplitterFactory).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(isSplitterFactoryDeployed(network)).toBe(true);
  });
});

describe("getViemChain", () => {
  it("throws for an unknown chainId", () => {
    expect(() => getViemChain(999_999)).toThrow(/Unsupported chainId/);
  });

  it.each(networks.map((n) => [n.label, n.id] as const))(
    "resolves a viem chain for %s (%d)",
    (_label, id) => {
      const chain = getViemChain(id);
      expect(chain.id).toBe(id);
    },
  );
});
