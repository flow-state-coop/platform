import { test, expect, type Page } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import {
  botHoldsAdmin,
  installRpcMock,
  TRUE_WORD,
  type AnswerCall,
} from "./helpers/rpcMock";
import { enterAuthenticated } from "./helpers/signIn";
import { getTestAccount, TEST_CHAIN_ID } from "./helpers/mockEthereum";

const TRANSFERABILITY_SELECTOR = "0x7e80bd5e";

// The API card is driven entirely by on-chain reads, so it only became testable
// once the RPC mock learned to unwrap wagmi's Multicall3 batching. Before that
// every read in the batch failed together and the card could only ever render
// its "couldn't check" state.

const ADMIN_PATH = `/flow-splitters/${TEST_CHAIN_ID}/1/admin`;

const KEYS = [
  {
    id: 1,
    label: "Social Metrics",
    keyPrefix: "splitter_7Kq2wR",
    createdBy: getTestAccount().address.toLowerCase(),
    createdAt: "2026-07-14T10:12:00.000Z",
    lastUsedAt: "2026-07-29T08:41:00.000Z",
    revokedAt: null,
  },
];

function json(body: unknown) {
  return { contentType: "application/json", body: JSON.stringify(body) };
}

async function openAdmin(page: Page, answerCall?: AnswerCall) {
  await installMockWallet(page);
  await installSubgraphMock(page);
  await installRpcMock(page, answerCall);

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
    route.fulfill(json({ success: true, writes: [], hasMore: false })),
  );

  await enterAuthenticated(page, ADMIN_PATH);
}

test("lists a key against the admin who minted it", async ({ page }) => {
  await openAdmin(page, botHoldsAdmin);

  await expect(page.getByText("Has admin access")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "Social Metrics" });

  await expect(row).toBeVisible();
  // Truncated, so match the ends rather than the whole address.
  await expect(row).toContainText("0xf39");
  await expect(row.getByRole("button", { name: "Revoke" })).toBeVisible();
});

test("offers the grant without a signed-in session when the bot has no admin", async ({
  page,
}) => {
  // No answerCall, so isPoolAdmin(bot) reads false rather than failing.
  await openAdmin(page);

  await expect(page.getByText("No admin access")).toBeVisible();

  // Granting is an on-chain transaction, so it needs a wallet and not SIWE. The
  // button stays visible rather than disappearing behind a sign-in it never
  // required.
  await expect(
    page.getByRole("button", { name: "Grant admin access" }),
  ).toBeVisible();
});

test("says the pool cannot be API-driven when shares are transferable", async ({
  page,
}) => {
  // transferabilityForUnitsOwner() is the only read that answers true here.
  await openAdmin(page, (callData) =>
    callData.toLowerCase().startsWith(TRANSFERABILITY_SELECTOR)
      ? TRUE_WORD
      : undefined,
  );

  await expect(
    page.getByText("The API does not support pools with transferable shares", {
      exact: false,
    }),
  ).toBeVisible();
});
