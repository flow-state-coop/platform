import { test, type Page } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import { botHoldsAdmin, installRpcMock, type AnswerCall } from "./helpers/rpcMock";
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

// Not tests: they rewrite tracked PNGs, so they stay skipped unless asked for.
// Recapture with `CAPTURE_DOCS=1 npx playwright test capture-api-keys` against
// a running `pnpm dev`, then eyeball the images before committing them.
test.skip(
  !process.env.CAPTURE_DOCS,
  "set CAPTURE_DOCS=1 to rewrite the admin docs screenshots",
);

async function openAdminCard(
  page: Page,
  state: {
    answerCall?: AnswerCall;
    hasActiveKeys: boolean;
    keys: typeof KEYS;
    writes: typeof WRITES;
  },
) {
  await installMockWallet(page);
  await installSubgraphMock(page);
  await installRpcMock(page, state.answerCall);

  await page.route("**/api/profiles/names", (route) =>
    route.fulfill(json({ success: true, names: {} })),
  );
  await page.route("**/api/flow-splitter/status*", (route) =>
    route.fulfill(json({ success: true, hasActiveKeys: state.hasActiveKeys })),
  );
  await page.route("**/api/flow-splitter/keys*", (route) =>
    route.fulfill(json({ success: true, keys: state.keys })),
  );
  await page.route("**/api/flow-splitter/history*", (route) =>
    route.fulfill(json({ success: true, writes: state.writes, hasMore: false })),
  );

  await page.setViewportSize({ width: 1280, height: 1400 });
  await enterAuthenticated(page, ADMIN_PATH);

  const card = page
    .locator(".card")
    .filter({ hasText: "Bot admin access" })
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

  return card;
}

test("capture the API card for the admin docs", async ({ page }) => {
  const card = await openAdminCard(page, {
    answerCall: botHoldsAdmin,
    hasActiveKeys: true,
    keys: KEYS,
    writes: WRITES,
  });

  await card.screenshot({
    path: "docs/platform/flow-splitters/img/api-keys.png",
  });
});

test("capture the API card before the bot holds admin", async ({ page }) => {
  const card = await openAdminCard(page, {
    hasActiveKeys: false,
    keys: [],
    writes: [],
  });

  await card.screenshot({
    path: "docs/platform/flow-splitters/img/api-grant.png",
  });
});
