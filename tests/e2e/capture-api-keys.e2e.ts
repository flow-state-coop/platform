import { test } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import { botHoldsAdmin, installRpcMock } from "./helpers/rpcMock";
import { enterAuthenticated } from "./helpers/signIn";
import { getTestAccount, TEST_CHAIN_ID } from "./helpers/mockEthereum";

const ADMIN_PATH = `/flow-splitters/${TEST_CHAIN_ID}/1/admin`;

// The wallet the page is signed in as, so the column shows the admin who would
// really have minted these.
const CREATED_BY = getTestAccount().address.toLowerCase();

const KEYS = [
  {
    id: 1,
    label: "Social Metrics",
    keyPrefix: "splitter_7Kq2wR",
    createdBy: CREATED_BY,
    createdAt: "2026-07-14T10:12:00.000Z",
    lastUsedAt: "2026-07-29T08:41:00.000Z",
    revokedAt: null,
  },
  {
    id: 2,
    label: "Revenue share sync",
    keyPrefix: "splitter_bT9xJ4",
    createdBy: CREATED_BY,
    createdAt: "2026-07-22T15:03:00.000Z",
    lastUsedAt: "2026-07-29T08:40:00.000Z",
    revokedAt: null,
  },
];

const WRITES = [
  {
    id: 12,
    changedCount: 34,
    status: "succeeded",
    txHashes: [`0x${"a4".repeat(32)}`],
    gasCostWei: "184000000000000",
    createdAt: "2026-07-29T08:41:00.000Z",
    keyLabel: "Social Metrics",
  },
  {
    id: 11,
    changedCount: 0,
    status: "no_change",
    txHashes: [],
    gasCostWei: "0",
    createdAt: "2026-07-29T07:41:00.000Z",
    keyLabel: "Revenue share sync",
  },
  {
    id: 10,
    changedCount: 112,
    status: "succeeded",
    txHashes: [`0x${"c7".repeat(32)}`, `0x${"e1".repeat(32)}`],
    gasCostWei: "391000000000000",
    createdAt: "2026-07-28T21:15:00.000Z",
    keyLabel: "Social Metrics",
  },
];

function json(body: unknown) {
  return { contentType: "application/json", body: JSON.stringify(body) };
}

// Not a test: it rewrites a tracked PNG, so it stays skipped unless asked for.
// Recapture with `CAPTURE_DOCS=1 npx playwright test capture-api-keys` against a
// running `pnpm dev`, then eyeball the image before committing it.
test.skip(
  !process.env.CAPTURE_DOCS,
  "set CAPTURE_DOCS=1 to rewrite the admin docs screenshot",
);

test("capture the API card for the admin docs", async ({ page }) => {
  await installMockWallet(page);
  await installSubgraphMock(page);
  await installRpcMock(page, botHoldsAdmin);

  await page.route("**/api/profiles/names", (route) =>
    route.fulfill(json({ success: true, names: {} })),
  );
  await page.route("**/api/flow-splitter/status*", (route) =>
    route.fulfill(json({ success: true, hasActiveKeys: true })),
  );
  await page.route("**/api/flow-splitter/keys*", (route) =>
    route.fulfill(json({ success: true, keys: KEYS })),
  );
  await page.route("**/api/flow-splitter/history*", (route) =>
    route.fulfill(json({ success: true, writes: WRITES, hasMore: false })),
  );

  await page.setViewportSize({ width: 1280, height: 1400 });
  await enterAuthenticated(page, ADMIN_PATH);

  const card = page
    .locator(".card")
    .filter({ hasText: "Flow State automation bot" })
    .first();

  await card.waitFor({ state: "visible" });
  await page.getByText("Write history").waitFor({ state: "visible" });

  // The sample request echoes window.location.origin, which is the capture
  // machine. Docs readers need the address they would actually post to.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("code")) {
      if (el.textContent?.includes("http://localhost:3000")) {
        el.textContent = el.textContent.replaceAll(
          "http://localhost:3000",
          "https://flowstate.network",
        );
      }
    }
  });

  await card.screenshot({
    path: "docs/platform/flow-splitters/img/api-keys.png",
  });
});
