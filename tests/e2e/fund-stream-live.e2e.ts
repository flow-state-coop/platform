import { test, expect } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";

// Live smoke test — hits the real OP Sepolia flow-council subgraph and RPC
// via `pnpm test:live`. Council deployed by
// `~/web3/flow-council/script/CreateFlowCouncil.s.sol` (factory in
// `src/lib/networks.ts:flowCouncilFactory`).
const LIVE_CHAIN_ID = 11155420;
const LIVE_COUNCIL_ADDRESS = "0x512E7c3855d9Cd5eB202843779160563556D45Ea";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test("@live OP Sepolia council resolves via subgraph", async ({ page }) => {
  await page.goto(`/flow-councils/${LIVE_CHAIN_ID}/${LIVE_COUNCIL_ADDRESS}`);
  // `ETHx` is the superToken symbol rendered in RoundBanner only when the
  // subgraph returns a non-null council whose `superToken` matches an entry
  // in `networks.ts`. A placeholder or failed query renders an empty cell.
  await expect(page.getByText("ETHx").first()).toBeVisible({ timeout: 30_000 });
});
