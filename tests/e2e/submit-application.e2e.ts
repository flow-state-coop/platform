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

  await expect(page.getByText(/E2E Primary Project/i)).toBeVisible({
    timeout: 15_000,
  });
});
