import { test, expect, type Locator } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import { installRpcMock } from "./helpers/rpcMock";
import { waitForAutoConnect } from "./helpers/signIn";
import { TEST_CHAIN_ID } from "./helpers/mockEthereum";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// Header and body share the same flex/width constants, so any drift is
// sub-pixel rounding. The bug this guards against shifted columns by tens of
// pixels, so a tight bound still separates pass from fail unambiguously.
const TOLERANCE = 1.5;

const ADMIN_PATH = `/flow-splitters/${TEST_CHAIN_ID}/1/admin`;

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
  await installRpcMock(page);
  await page.route("**/api/profiles/names", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, names: {} }),
    }),
  );
  await page.route("**/api/flow-splitter/status*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, hasActiveKeys: false }),
    }),
  );
});

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) {
    throw new Error("expected a visible element with a bounding box");
  }
  return rect;
}

async function expectAligned(
  header: Locator,
  cell: Locator,
  label: string,
): Promise<void> {
  const headerBox = await box(header);
  const cellBox = await box(cell);

  expect(
    Math.abs(headerBox.x - cellBox.x),
    `"${label}" header left edge vs cell`,
  ).toBeLessThanOrEqual(TOLERANCE);
  expect(
    Math.abs(headerBox.width - cellBox.width),
    `"${label}" header width vs cell`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

for (const viewport of VIEWPORTS) {
  test(`splitter admin header columns align with their cells (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(ADMIN_PATH);

    const adminsCard = page
      .locator(".card")
      .filter({ has: page.getByText("Contract Admin", { exact: true }) });
    const registerCard = page
      .locator(".card")
      .filter({ has: page.getByText(/^Share Register/) });

    const adminAddressCell = adminsCard.getByPlaceholder("Admin Address");
    await expect(adminAddressCell).toBeVisible();

    await expectAligned(
      adminsCard.getByText("Address", { exact: true }),
      adminAddressCell,
      `admins address (${viewport.name})`,
    );

    const recipientAddressCell = registerCard.getByPlaceholder(
      "Recipient Address",
      { exact: true },
    );
    await expect(recipientAddressCell).toBeVisible();

    await expectAligned(
      registerCard.getByText("Address", { exact: true }),
      recipientAddressCell,
      `register address (${viewport.name})`,
    );

    await expectAligned(
      registerCard.getByText("Shares", { exact: true }),
      registerCard.getByLabel("Recipient Shares"),
      `register shares (${viewport.name})`,
    );

    await expectAligned(
      registerCard.getByText("Share %", { exact: true }),
      registerCard.getByPlaceholder("%", { exact: true }),
      `register share % (${viewport.name})`,
    );

    // The totals row is a separate flex row from the entry rows, so it can
    // drift on its own.
    await expectAligned(
      registerCard.getByText("Shares", { exact: true }),
      registerCard.getByLabel("Total Shares"),
      `totals shares (${viewport.name})`,
    );
    await expectAligned(
      registerCard.getByText("Share %", { exact: true }),
      registerCard.getByLabel("Total Share %"),
      `totals share % (${viewport.name})`,
    );

    const nameColumns = [
      {
        label: "admins profile name",
        cell: adminsCard.getByLabel("Admin Profile Name"),
      },
      {
        label: "register profile name",
        cell: registerCard.getByLabel("Recipient Profile Name"),
      },
    ];

    if (viewport.name === "mobile") {
      // These rows already carry several controls, so the name column drops
      // rather than squeezing the address.
      for (const { cell } of nameColumns) {
        await expect(cell).toHaveCount(0);
      }
      await expect(
        page.getByText("Profile Name", { exact: true }),
      ).toHaveCount(0);
      return;
    }

    await expectAligned(
      adminsCard.getByText("Profile Name", { exact: true }),
      nameColumns[0].cell,
      `admins profile name (${viewport.name})`,
    );
    await expectAligned(
      registerCard.getByText("Profile Name", { exact: true }),
      nameColumns[1].cell,
      `register profile name (${viewport.name})`,
    );
  });
}

test("removal rows keep the register's columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ADMIN_PATH);
  // Removing a recipient is an admin-only control, so the injected wallet has
  // to be connected before the button is clickable.
  await waitForAutoConnect(page);

  const registerCard = page
    .locator(".card")
    .filter({ has: page.getByText(/^Share Register/) });

  await registerCard.getByAltText("Remove").first().click();

  const removedAddress = registerCard.getByLabel(
    "Removed Recipient Profile Name",
  );
  await expect(removedAddress).toBeVisible();

  await expectAligned(
    registerCard.getByText("Profile Name", { exact: true }),
    removedAddress,
    "removal row profile name",
  );
  await expectAligned(
    registerCard.getByText("Shares", { exact: true }),
    registerCard.getByLabel("Removed Recipient Shares"),
    "removal row shares",
  );
  await expectAligned(
    registerCard.getByText("Share %", { exact: true }),
    registerCard.getByLabel("Removed Recipient Share %"),
    "removal row share %",
  );
});
