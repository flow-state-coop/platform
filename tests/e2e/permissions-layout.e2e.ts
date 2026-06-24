import { test, expect, type Locator } from "@playwright/test";
import { installMockWallet, readFixture } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// Header and body share the same flex/width constants, so any drift is
// sub-pixel rounding. The bug this guards against shifted columns by tens of
// pixels, so a tight bound still separates pass from fail unambiguously.
const TOLERANCE = 1.5;

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
  await page.route("**/api/flow-council/voter-groups/profiles", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, names: {} }),
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

for (const viewport of VIEWPORTS) {
  test(`permissions header columns align with their cells (${viewport.name})`, async ({
    page,
  }) => {
    const fx = readFixture();
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(
      `/flow-councils/permissions/${fx.chainId}/${fx.councilAddress}`,
    );

    const row = page.locator(".hstack", {
      has: page.getByPlaceholder("Manager Address"),
    });
    const addressCell = row.getByPlaceholder("Manager Address");
    const nameCell = row.getByLabel("Profile Name");
    await expect(addressCell).toBeVisible();
    await expect(nameCell).toBeVisible();

    const columns = [
      {
        label: "Address",
        header: page.getByText("Address", { exact: true }),
        cell: addressCell,
      },
      {
        label: "Profile Name",
        header: page.getByText("Profile Name", { exact: true }),
        cell: nameCell,
      },
    ];

    for (const { label, header, cell } of columns) {
      const headerBox = await box(header);
      const cellBox = await box(cell);
      expect(
        Math.abs(headerBox.x - cellBox.x),
        `${viewport.name}: "${label}" header left edge vs cell`,
      ).toBeLessThanOrEqual(TOLERANCE);
      expect(
        Math.abs(headerBox.width - cellBox.width),
        `${viewport.name}: "${label}" header width vs cell`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }

    const checkboxes = row.locator('input[type="checkbox"]');
    const roleHeaders = ["Super Admin", "Voter Review", "Recipient Review"];
    await expect(checkboxes).toHaveCount(roleHeaders.length);

    for (let i = 0; i < roleHeaders.length; i++) {
      const headerBox = await box(
        page.getByText(roleHeaders[i], { exact: true }),
      );
      const checkboxBox = await box(checkboxes.nth(i));
      const headerCenter = headerBox.x + headerBox.width / 2;
      const checkboxCenter = checkboxBox.x + checkboxBox.width / 2;
      expect(
        Math.abs(headerCenter - checkboxCenter),
        `${viewport.name}: "${roleHeaders[i]}" header center vs checkbox`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });
}
