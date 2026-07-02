import { test, expect } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { enterAuthenticated } from "./helpers/signIn";
import { readFixture } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
});

test("authenticated manager reaches the application project-selection page", async ({
  page,
}) => {
  const fx = readFixture();

  await enterAuthenticated(
    page,
    `/flow-councils/application/${fx.chainId}/${fx.councilAddress}`,
  );

  const project = page.getByText(/E2E Primary Project/i);

  try {
    await expect(project).toBeVisible({ timeout: 15_000 });
  } catch (err) {
    // The page fetches projects once with no retry, so a single transient
    // API failure leaves the list empty forever. Reload before failing.
    console.warn("project list empty on first attempt, reloading", err);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(project).toBeVisible({ timeout: 15_000 });
  }
});
