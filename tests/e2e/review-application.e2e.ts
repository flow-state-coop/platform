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

  // Recipient table: Address column is gone; Project + Pool Connection are present.
  const projectHeader = page.getByRole("columnheader", { name: "Project" });
  await expect(projectHeader).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Pool Connection" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Address" })).toHaveCount(
    0,
  );

  // Connect All sits above Next. With the default subgraph mock returning
  // no pool members, the pool membership map is empty, so the button shows
  // "No Recipients in Pool" disabled (distinguishing this from the genuine
  // "All Connected" case where members exist and are all connected).
  const connectAll = page.getByRole("button", {
    name: /No Recipients in Pool/,
  });
  await expect(connectAll).toBeVisible();
  await expect(connectAll).toBeDisabled();

  const nextButton = page.getByRole("button", { name: "Next" });
  await expect(nextButton).toBeVisible();
});

test("filters the recipients table by project name", async ({ page }) => {
  const fx = readFixture();
  const path = `/flow-councils/review/${fx.chainId}/${fx.councilAddress}`;

  await page.goto(path);
  await signInViaSiweApi(page);
  await page.goto(path);

  const seededRow = page.getByRole("cell", { name: "E2E Secondary Project" });
  await expect(seededRow).toBeVisible();

  await page.getByRole("button", { name: "Filter by name" }).click();

  const search = page.getByRole("searchbox", {
    name: "Filter projects by name",
  });
  await expect(search).toBeFocused();

  await search.fill("secondary");
  await expect(seededRow).toBeVisible();

  await search.fill("no-such-project");
  await expect(seededRow).toHaveCount(0);
  await expect(
    page.getByText("No recipients match your filters."),
  ).toBeVisible();

  await search.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(seededRow).toBeVisible();
});
