import { test, expect } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { signInViaSiweApi } from "./helpers/signIn";
import { readFixture } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
});

// The full fund-stream path (approve → upgrade → distribute) requires real
// onchain state: a deployed Flow Council, granted roles, funded balances,
// and live subgraph indexing. Automating it in CI is brittle — see the
// testing-strategy spec, section 3. This test exercises the CI-safe slice:
// auth bootstrap + navigation to the council page.
test("authenticated user reaches the council page", async ({ page }) => {
  const fx = readFixture();
  const path = `/flow-councils/${fx.chainId}/${fx.councilAddress}`;

  await page.goto(path);
  await signInViaSiweApi(page);

  const sessionRes = await page.request.get("/api/auth/session");
  const session = await sessionRes.json();
  expect(session?.address).toBeTruthy();

  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[./]/g, "\\$&")));
});
