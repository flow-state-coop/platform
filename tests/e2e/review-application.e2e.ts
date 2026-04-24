import { test, expect } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { signInViaSiweApi } from "./helpers/signIn";
import { readFixture } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
});

// Review/route.ts performs a server-side publicClient.readContract for the
// RECIPIENT_MANAGER_ROLE check. That RPC is not reachable from page.route
// (it fires from the Next.js server, not the browser). We stub the review
// API response itself; the server-side authorization logic is covered by
// integration tests that mock viem's publicClient at the module level.
test("admin reaches the review page with an authenticated session", async ({
  page,
}) => {
  const fx = readFixture();
  const path = `/flow-councils/review/${fx.chainId}/${fx.councilAddress}`;

  await page.route("**/api/flow-council/review", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Application updated successfully",
      }),
    }),
  );

  await page.goto(path);
  await signInViaSiweApi(page);

  const sessionRes = await page.request.get("/api/auth/session");
  const session = await sessionRes.json();
  expect(session?.address).toBeTruthy();

  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[./]/g, "\\$&")));
});
