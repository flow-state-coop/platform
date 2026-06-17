import { test, expect } from "@playwright/test";
import { installMockWallet, readFixture } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import { enterAuthenticated } from "./helpers/signIn";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
});

// The Funding tab is always shown in the sidebar regardless of whether the
// council has a superappSplitterAddress or the chain's superAppSplitterFactory
// is deployed. The seeded E2E council has no splitter, yet the link must still
// render; the funding page itself surfaces a graceful empty state (asserted
// below).
test("Funding sidebar link is shown even when council has no splitter", async ({
  page,
}) => {
  const fx = readFixture();
  await enterAuthenticated(
    page,
    `/flow-councils/membership/${fx.chainId}/${fx.councilAddress}`,
  );

  await expect(page.getByRole("link", { name: "Voters" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Funding" })).toBeVisible();
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
