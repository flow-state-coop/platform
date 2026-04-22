import { test, expect } from "@playwright/test";
import { getTestAccount } from "./helpers/mockEthereum";
import { installMockWallet } from "./helpers/setup";
import { waitForAutoConnect } from "./helpers/signIn";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test("injected mock wallet auto-connects and shows the account address", async ({
  page,
}) => {
  const { address } = getTestAccount();

  await page.goto("/projects");
  await waitForAutoConnect(page);

  await expect(
    page.getByText(new RegExp(address.slice(-4), "i")).first(),
  ).toBeVisible();
});
