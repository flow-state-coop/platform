import { test, expect, type Page } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import { botHoldsAdmin, installRpcMock } from "./helpers/rpcMock";
import { enterAuthenticated } from "./helpers/signIn";
import { UNLOCK_TX_NOT_FOUND_ERROR } from "@/lib/splitterUnlock";

// The unlock flow only exists on chains where API writes are paid for, so
// these tests run the admin page on Base rather than the fixtures' OP
// Sepolia. Every read and the claim itself are mocked, so no request leaves
// the page.
const GATED_CHAIN_ID = 8453;
const ADMIN_PATH = `/flow-splitters/${GATED_CHAIN_ID}/1/admin`;

const PAYMENT_TX = `0x${"ab".repeat(32)}`;

const PENDING_COPY =
  "Couldn't confirm payment at this time. Click the refresh icon to check again. Your payment isn't lost.";

function json(body: unknown) {
  return { contentType: "application/json", body: JSON.stringify(body) };
}

type OpenOptions = {
  // Seeds the hash the hook stores when a payment is broadcast, which is the
  // state a claim that lost its response leaves behind.
  pendingTx?: string;
  // Refuses every claim with this message instead of accepting it.
  claimError?: string;
};

async function openLockedAdmin(page: Page, options: OpenOptions = {}) {
  const { pendingTx, claimError } = options;

  await installMockWallet(page, { chainId: GATED_CHAIN_ID });
  await installSubgraphMock(page);
  await installRpcMock(page, botHoldsAdmin);

  let unlocked = false;
  const claims: unknown[] = [];

  await page.route("**/api/profiles/names", (route) =>
    route.fulfill(json({ success: true, names: {} })),
  );
  await page.route("**/api/flow-splitter/status*", (route) =>
    route.fulfill(json({ success: true, hasActiveKeys: false, unlocked })),
  );
  await page.route("**/api/flow-splitter/keys*", (route) =>
    route.fulfill(json({ success: true, keys: [] })),
  );
  await page.route("**/api/flow-splitter/history*", (route) =>
    route.fulfill(json({ success: true, writes: [], hasMore: false })),
  );
  await page.route("**/api/flow-splitter/unlock", (route) => {
    claims.push(route.request().postDataJSON());

    if (claimError) {
      return route.fulfill({
        status: 400,
        ...json({ success: false, error: claimError }),
      });
    }

    unlocked = true;
    return route.fulfill(json({ success: true, unlocked: true }));
  });

  if (pendingTx) {
    await page.addInitScript(
      ([chainId, hash]) => {
        window.localStorage.setItem(
          `splitterUnlockTx:${chainId}:1`,
          String(hash),
        );
      },
      [GATED_CHAIN_ID, pendingTx] as const,
    );
  }

  await enterAuthenticated(page, ADMIN_PATH);

  return { claims };
}

test("offers the one-time payment with the beta caveat", async ({ page }) => {
  await openLockedAdmin(page);

  await expect(
    page.getByRole("button", { name: "Pay 10 USDC to unlock" }),
  ).toBeVisible();
  await expect(
    page.getByText("The Flow Splitter API is in beta", { exact: false }),
  ).toBeVisible();
});

test("finds a stored payment through the refresh icon instead of asking to pay again", async ({
  page,
}) => {
  const { claims } = await openLockedAdmin(page, { pendingTx: PAYMENT_TX });

  // A payment that was sent but never counted must not be asked for twice:
  // the pay button is replaced by the recovery copy and its refresh icon.
  await expect(page.getByText(PENDING_COPY)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pay 10 USDC to unlock" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Check payment again" }).click();

  await expect(page.getByText(PENDING_COPY)).toHaveCount(0);
  await expect.poll(() => claims.length).toBe(1);
  expect(claims[0]).toEqual({
    chainId: GATED_CHAIN_ID,
    poolId: "1",
    txHash: PAYMENT_TX,
  });
});

test("keeps the recovery state when the claim is refused retryably", async ({
  page,
}) => {
  await openLockedAdmin(page, {
    pendingTx: PAYMENT_TX,
    claimError: UNLOCK_TX_NOT_FOUND_ERROR,
  });

  await page.getByRole("button", { name: "Check payment again" }).click();

  // A refusal that can still change keeps the stored payment and the icon to
  // retry it, with the server's reason underneath.
  await expect(page.getByText(UNLOCK_TX_NOT_FOUND_ERROR)).toBeVisible();
  await expect(page.getByText(PENDING_COPY)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pay 10 USDC to unlock" }),
  ).toHaveCount(0);
});

test("claims the stored payment too when another hash is verified by hand", async ({
  page,
}) => {
  const STORED_TX = `0x${"cd".repeat(32)}`;
  const { claims } = await openLockedAdmin(page, { pendingTx: STORED_TX });

  await page
    .getByRole("button", { name: "Already paid? Verify the transaction" })
    .click();
  await page.getByLabel("Payment transaction").fill(PAYMENT_TX);
  await page.getByRole("button", { name: "Verify payment" }).click();

  // The stored hash names a transfer that reached the bot and was never
  // counted. Unlocking with a different one drops the only record of it, so it
  // has to be claimed before that happens.
  await expect
    .poll(() => claims.map((claim) => (claim as { txHash: string }).txHash))
    .toEqual([PAYMENT_TX, STORED_TX]);
});

test("claims a payment pasted as a block explorer link", async ({ page }) => {
  const { claims } = await openLockedAdmin(page);

  await page
    .getByRole("button", { name: "Already paid? Verify the transaction" })
    .click();
  await page
    .getByLabel("Payment transaction")
    .fill(`https://basescan.org/tx/${PAYMENT_TX}`);
  await page.getByRole("button", { name: "Verify payment" }).click();

  await expect.poll(() => claims.length).toBe(1);
  expect(claims[0]).toEqual({
    chainId: GATED_CHAIN_ID,
    poolId: "1",
    txHash: PAYMENT_TX,
  });
  await expect(
    page.getByText("Programmatic writes are locked", { exact: false }),
  ).toHaveCount(0);
});
