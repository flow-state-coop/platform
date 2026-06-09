import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { FLOW_STATE_BOT_ADDRESS } from "./constants";

// Guard against silent drift between the hardcoded bot address and the key the
// eligibility bot actually signs `addVoter` with (FLOW_STATE_ELIGIBILITY_PK in
// api/flow-council/eligibility). Nothing in code links the two, and a mismatch
// silently breaks GoodDollar self-claim: the grant lands on the wrong account,
// so the bot's addVoter reverts NOT_VOTER_MANAGER.
//
// Skipped when the key isn't in the environment (e.g. plain local runs); it
// validates wherever FLOW_STATE_ELIGIBILITY_PK is set, including after a
// rotation.
describe("FLOW_STATE_BOT_ADDRESS", () => {
  const pk = process.env.FLOW_STATE_ELIGIBILITY_PK;

  it.runIf(!!pk)(
    "equals the address derived from FLOW_STATE_ELIGIBILITY_PK",
    () => {
      const derived = privateKeyToAccount(pk as `0x${string}`).address;

      expect(derived.toLowerCase()).toBe(FLOW_STATE_BOT_ADDRESS.toLowerCase());
    },
  );
});
