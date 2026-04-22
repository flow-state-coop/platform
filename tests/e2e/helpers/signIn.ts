import type { Page } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { getTestAccount, TEST_CHAIN_ID, TEST_PRIVATE_KEY } from "./mockEthereum";

// Wait for the injected wallet to auto-connect. RainbowKit's injected
// connector picks up window.ethereum on mount, so there is no "Connect
// Wallet" button to click — the account chip appears directly. Match on the
// last 4 hex characters of the address, which every truncation scheme
// (0xf3…2266, 0xf39F…2266, full) contains.
export async function waitForAutoConnect(page: Page): Promise<void> {
  const { address } = getTestAccount();
  const tail = address.slice(-4);
  await page
    .getByText(new RegExp(tail, "i"))
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

// Bootstrap a NextAuth SIWE session without walking the UI. Fetches CSRF,
// constructs a matching SIWE message, signs it in Node with viem, and POSTs
// the credentials callback — same request the app would make after clicking
// Sign-In, but deterministic and dependency-free.
export async function signInViaSiweApi(page: Page): Promise<void> {
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);
  const baseUrl = new URL(page.url()).origin;

  const csrfRes = await page.request.get(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  // `/api/auth/csrf` returns the raw token. The pipe-delimited `token|hash`
  // form lives only in the cookie; the server splits the cookie and compares
  // the first half to the SIWE `nonce`, so the nonce is the raw `csrfToken`.
  const nonce = csrfToken;

  const host = new URL(baseUrl).host;
  const message = createSiweMessage({
    domain: host,
    address: account.address,
    statement: "Sign in with Ethereum to Flow State.",
    uri: baseUrl,
    version: "1",
    chainId: TEST_CHAIN_ID,
    nonce,
  });

  const signature = await account.signMessage({ message });

  // `origin` and `referer` are required for NextAuth's SIWE verifier to
  // derive the domain it should compare against the signed message; without
  // them the server falls back to the prod hostname and verification fails.
  await page.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/`,
    },
    form: {
      csrfToken,
      message,
      signature,
      callbackUrl: baseUrl,
      json: "true",
    },
  });
}

// Convenience wrapper for the common case: navigate, wait for auto-connect,
// bootstrap SIWE, then reload so the client sees the session cookie.
export async function enterAuthenticated(
  page: Page,
  path: string,
): Promise<void> {
  await page.goto(path);
  await waitForAutoConnect(page);
  await signInViaSiweApi(page);
  await page.goto(path);
  await waitForAutoConnect(page);
}
