import { test, expect, type Page } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { installSubgraphMock } from "./helpers/subgraphMock";
import {
  botHoldsAdmin,
  installRpcMock,
  TRUE_WORD,
  type AnswerCall,
} from "./helpers/rpcMock";
import {
  enterAuthenticated,
  preventAutoSignIn,
  waitForAutoConnect,
} from "./helpers/signIn";
import { getTestAccount, TEST_CHAIN_ID } from "./helpers/mockEthereum";

// Any configured chain that is not the fixtures' one, for the wrong-network
// states the card gates its actions on.
const OTHER_CHAIN_ID = 8453;

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
    lastUsedAt: "2026-07-29T08:41:00.000Z" as string | null,
    revokedAt: null as string | null,
  },
];

function json(body: unknown) {
  return { contentType: "application/json", body: JSON.stringify(body) };
}

type OpenOptions = {
  answerCall?: AnswerCall;
  // Left false for the states that are meant to render before anyone signs in:
  // bootstrapping a session would satisfy the very gate under test.
  signIn?: boolean;
  walletChainId?: number;
  // Defaults to the connected wallet, so the page renders for an admin.
  poolAdmins?: string[];
};

async function openAdmin(page: Page, options: OpenOptions = {}) {
  const { answerCall, signIn = false, walletChainId, poolAdmins } = options;

  await installMockWallet(page, { chainId: walletChainId });
  await installSubgraphMock(page, { splitterPoolAdmins: poolAdmins });
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

  if (signIn) {
    await enterAuthenticated(page, ADMIN_PATH);
    return;
  }

  await preventAutoSignIn(page);
  await page.goto(ADMIN_PATH, { waitUntil: "domcontentloaded" });
  await waitForAutoConnect(page);
}

test("lists a key against the admin who minted it", async ({ page }) => {
  await openAdmin(page, { answerCall: botHoldsAdmin, signIn: true });

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
  // No session, and no answerCall so isPoolAdmin(bot) reads false rather than
  // failing.
  await openAdmin(page);

  await expect(page.getByText("No admin access")).toBeVisible();

  // Granting is an on-chain transaction, so it needs a wallet and not SIWE. The
  // button stays visible rather than disappearing behind a sign-in it never
  // required, and the keys section below is the only thing asking for one.
  await expect(
    page.getByRole("button", { name: "Grant admin access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign In With Ethereum" }),
  ).toBeVisible();
});

test("tells a non-admin they cannot manage keys instead of asking for a sign-in", async ({
  page,
}) => {
  // Adminship follows from the connected address, so the answer is already
  // known: walking someone through SIWE only to refuse them afterwards spends
  // a signature to tell them something the page could have said first.
  await openAdmin(page, {
    answerCall: botHoldsAdmin,
    poolAdmins: ["0x000000000000000000000000000000000000dead"],
  });

  await expect(
    page.getByText("Only this pool's admins can manage API keys."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign In With Ethereum" }),
  ).toHaveCount(0);
});

test("asks to switch network once, not once per section", async ({ page }) => {
  await openAdmin(page, { walletChainId: OTHER_CHAIN_ID });

  // The grant slot carries the wallet step, so the keys section must not repeat
  // it: two identically labelled buttons say nothing about which to press.
  const switchNetwork = page.getByRole("button", { name: "Switch Network" });

  await expect(switchNetwork).toHaveCount(1);
  await expect(switchNetwork).toBeVisible();
});

test("mints a key from the label form and revokes one through its confirm", async ({
  page,
}) => {
  await openAdmin(page, { answerCall: botHoldsAdmin, signIn: true });

  // Later registrations win, so this replaces openAdmin's static keys route
  // with one that remembers what the mint and the revoke changed.
  let keys = [...KEYS];
  await page.route("**/api/flow-splitter/keys*", (route) => {
    const method = route.request().method();

    if (method === "POST") {
      keys = [
        ...keys,
        {
          id: 2,
          label: "New integration",
          keyPrefix: "splitter_9Ab3xY",
          createdBy: getTestAccount().address.toLowerCase(),
          createdAt: "2026-07-31T09:00:00.000Z",
          lastUsedAt: null,
          revokedAt: null,
        },
      ];
      return route.fulfill(
        json({
          success: true,
          key: {
            id: 2,
            token: "splitter_9Ab3xYtestOnlyToken",
            keyPrefix: "splitter_9Ab3xY",
          },
        }),
      );
    }

    if (method === "DELETE") {
      keys = keys.map((key) =>
        key.id === 1 ? { ...key, revokedAt: "2026-07-31T09:05:00.000Z" } : key,
      );
      return route.fulfill(json({ success: true }));
    }

    return route.fulfill(json({ success: true, keys }));
  });

  // Enter submits the label form, and the one-time token renders above the
  // card rather than inside the panel that will re-render under it.
  await page.getByLabel("Key label").fill("New integration");
  await page.getByLabel("Key label").press("Enter");

  await expect(
    page.getByText("Copy your key now", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("splitter_9Ab3xYtestOnlyToken")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "Social Metrics" });
  await row.getByRole("button", { name: "Revoke" }).click();
  await row.getByRole("button", { name: "Confirm" }).click();

  await expect(row.getByText("Revoked")).toBeVisible();
});

test("says the pool cannot be API-driven when shares are transferable", async ({
  page,
}) => {
  // transferabilityForUnitsOwner() is the only read that answers true here.
  await openAdmin(page, {
    signIn: true,
    answerCall: (callData) =>
      callData.toLowerCase().startsWith(TRANSFERABILITY_SELECTOR)
        ? TRUE_WORD
        : undefined,
  });

  await expect(
    page.getByText("The API does not support pools with transferable shares", {
      exact: false,
    }),
  ).toBeVisible();
});
