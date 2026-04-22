# E2E Tests

Playwright tests covering the critical-path user flows: wallet connection, SIWE
authentication, project creation, application submission, application review, and
fund-stream navigation. All tests run against a real Next.js server with a seeded
test database and a browser-side mock Ethereum provider.

## Structure

```
tests/e2e/
  *.e2e.ts          # Test files (one file per flow)
  helpers/
    mockEthereum.ts  # Builds the window.ethereum mock injected into the browser
    siweHelper.ts    # Bridges browser sign requests to a Node-side viem signer
    setup.ts         # installMockWallet() + readFixture()
    signIn.ts        # connectAndSignIn() — drives the RainbowKit modal
    e2eDb.ts         # seedE2eFixture() / teardownE2eDb()
  setup/
    global.ts        # Playwright globalSetup: seeds the DB, writes fixture JSON
    teardown.ts      # Playwright globalTeardown: resets DB, removes fixture JSON
    fixtureFile.ts   # Shared path constant for the fixture JSON (OS tmpdir)
```

### Test files

| File | What it covers |
|---|---|
| `wallet-connect.e2e.ts` | Connect button → wallet picker → truncated address visible |
| `create-project.e2e.ts` | SIWE sign-in → /projects → Create Project modal opens |
| `submit-application.e2e.ts` | SIWE sign-in → application page → manager's seeded project listed |
| `review-application.e2e.ts` | SIWE sign-in → review page → seeded application row visible |
| `fund-stream.e2e.ts` | SIWE sign-in → council page → gated UI renders (CI-safe) |
| `fund-stream.e2e.ts` `@live` | Same flow against real OP Sepolia (main-branch only) |

## Running locally

```bash
pnpm install
pnpm exec playwright install chromium
```

Create `.env.test.local` at the repo root with at minimum:

```
TEST_DATABASE_URL=postgres://...
NEXTAUTH_SECRET=any-random-string
# Optional — defaults to the well-known Hardhat/Anvil account 0 key
# TEST_PRIVATE_KEY=0x...
```

Start the dev server in a separate terminal, then run the tests:

```bash
pnpm dev
# in another terminal:
pnpm test:e2e
```

To run only the `@live` smoke test (requires OP Sepolia access):

```bash
pnpm test:live
```

The base URL defaults to `http://localhost:3000`. Override with `E2E_BASE_URL` to
point at a deployed preview instead.

## How the mock wallet works

`global.ts` seeds the database once before the test run and writes a fixture JSON
to `$TMPDIR/platform-e2e-fixture.json`. Each test reads this file with
`readFixture()` to get the round/council/project/application IDs.

Each test calls `installMockWallet(page)` in `beforeEach`. This does two things
in order:

1. Registers `window.__nodeSign` via `page.exposeFunction` — a Node-side viem
   signer that handles `personal_sign` requests from the browser.
2. Injects a fake EIP-1193 provider at `window.ethereum` via `page.addInitScript`.
   The provider presents as MetaMask on OP Sepolia (chainId 11155420) with the
   address derived from `TEST_PRIVATE_KEY`.

The sign bridge only signs messages that match `/Sign in with Ethereum/i`.
Anything else is rejected, including `eth_signTypedData_v4`.

## Adding a new test

1. Create `tests/e2e/your-flow.e2e.ts`.
2. Call `installMockWallet(page)` in `beforeEach`.
3. Use `connectAndSignIn(page)` when the flow requires a SIWE session.
4. Use `readFixture()` to get the seeded round/council/project IDs.
5. Stub browser-side HTTP calls with `page.route()` as needed (subgraph, APIs).

```ts
import { test, expect } from "@playwright/test";
import { installMockWallet, readFixture } from "./helpers/setup";
import { connectAndSignIn } from "./helpers/signIn";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test("my new flow", async ({ page }) => {
  const fx = readFixture();
  await page.goto(`/some-page/${fx.chainId}/${fx.councilAddress}`);
  await connectAndSignIn(page);
  await expect(page.getByText(/expected content/i)).toBeVisible();
});
```

Tag a test `@live` to exclude it from the default `test:e2e` run and include it
only in `test:live`:

```ts
test("@live smoke test against real network", async ({ page }) => { ... });
```

## CI

| Workflow | Trigger | Runs |
|---|---|---|
| `test-pr.yml` | PR to main | typecheck, lint, unit, integration |
| `test-main.yml` | Push to main | everything above + E2E + live smoke tests |

E2E tests in `test-main.yml` run against a local build (`pnpm build && pnpm start`)
unless `VERCEL_PREVIEW_URL` is set as a repository secret, in which case they run
against that URL. On failure, the Playwright HTML report is uploaded as an artifact
retained for 7 days.

### Required secrets

| Secret | Used by |
|---|---|
| `TEST_DATABASE_URL` | integration + E2E |
| `NEXTAUTH_SECRET` | integration + E2E |
| `TEST_PRIVATE_KEY` | integration + E2E |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | build (main only) |
| `NEXT_PUBLIC_POSTHOG_KEY` | build (main only) |
| `NEXT_PUBLIC_POSTHOG_HOST` | build (main only) |
| `VERCEL_PREVIEW_URL` | optional — skips local build if set |

## Known limits

- **`fullyParallel: false`** — tests run sequentially. The shared seeded database
  and singleton `window.ethereum` mock make concurrent runs unreliable.
- **Server-side RPC calls are not interceptable via `page.route()`** — calls made
  from the Next.js server process (e.g., `publicClient.readContract` in API routes)
  bypass the browser network layer entirely. Stub the API response itself, or cover
  that logic in integration tests that mock viem at the module level.
- **The sign bridge only supports SIWE** — `eth_signTypedData_v4` throws
  deliberately. Any flow that needs typed-data signatures (EIP-712 transactions,
  permit calls) cannot be driven through this mock and must be tested at a lower
  layer or with a different approach.
