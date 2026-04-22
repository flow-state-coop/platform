import { test, expect } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { readFixture } from "./helpers/setup";

// Kept in its own file — no subgraph mock — so `@live` genuinely hits the
// real OP Sepolia subgraph/RPC when invoked via `pnpm test:live`.
test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test("@live OP Sepolia stream bootstrap smoke test", async ({ page }) => {
  // `@live` runs only via `pnpm test:live` (CI main-branch). No network
  // stubs — the council page hits the real OP Sepolia subgraph/RPC. The
  // test asserts the page renders the Grantees tab, which only appears
  // when the flow-council query resolves without error.
  const fx = readFixture();
  await page.goto(`/flow-councils/${fx.chainId}/${fx.councilAddress}`);
  await expect(page.getByRole("link", { name: "Grantees" })).toBeVisible();
});
