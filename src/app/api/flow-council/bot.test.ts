import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./db", () => ({ db: {} }));

import { buildBotSigner } from "./bot";
import { networks } from "@/lib/networks";

// Any well-known throwaway key whose address is NOT the production bot's.
const THROWAWAY_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const network = networks[0];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildBotSigner identity guard", () => {
  it("throws outside tests when the key does not derive the bot address", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FLOW_STATE_ELIGIBILITY_PK", THROWAWAY_PK);

    expect(() => buildBotSigner(network)).toThrow(
      "FLOW_STATE_ELIGIBILITY_PK does not derive FLOW_STATE_BOT_ADDRESS",
    );
  });

  it("skips the identity check under NODE_ENV=test, where the key is a throwaway by design", () => {
    vi.stubEnv("FLOW_STATE_ELIGIBILITY_PK", THROWAWAY_PK);

    const { account } = buildBotSigner(network);

    expect(account.address).toBeDefined();
  });

  it("throws when the key is not configured at all", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FLOW_STATE_ELIGIBILITY_PK", "");

    expect(() => buildBotSigner(network)).toThrow(
      "FLOW_STATE_ELIGIBILITY_PK is not configured",
    );
  });
});
