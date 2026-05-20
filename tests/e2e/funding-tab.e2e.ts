import { test, expect } from "@playwright/test";
import { installMockWallet, readFixture } from "./helpers/setup";
import { enterAuthenticated } from "./helpers/signIn";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

// The seeded E2E council has no superappSplitterAddress, which alone gates
// the Funding tab off regardless of whether the chain's
// superAppSplitterFactory is deployed. Here we assert the gate holds
// end-to-end.
test("Funding sidebar link is hidden when council has no splitter", async ({
  page,
}) => {
  const fx = readFixture();
  await enterAuthenticated(
    page,
    `/flow-councils/membership/${fx.chainId}/${fx.councilAddress}`,
  );

  // The other wizard tabs in SIDEBAR_LINK_DEFS render unconditionally; if any
  // of them is visible we know the sidebar mounted before we check that
  // Funding is missing.
  await expect(page.getByRole("link", { name: "Voters" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Funding" })).toHaveCount(0);
});

test("Funding page shows graceful empty state when no splitter is configured", async ({
  page,
}) => {
  const fx = readFixture();
  await enterAuthenticated(
    page,
    `/flow-councils/funding/${fx.chainId}/${fx.councilAddress}`,
  );

  await expect(
    page.getByText(/no super app splitter is configured/i),
  ).toBeVisible();
});
