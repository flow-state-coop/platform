---
slug: /developers/testing
description: Unit, integration, and end-to-end tests
---

# Testing

The platform has three test layers: **Vitest** unit tests, **Vitest** integration tests against a real Postgres branch, and **Playwright** end-to-end tests driven by a mock wallet. A subset of the e2e suite is tagged `@live` and runs against a real testnet.

## Commands

All commands run through **pnpm** and are defined in `package.json`:

| Command | What it runs |
|---|---|
| `pnpm test` | `vitest run --passWithNoTests` — the full Vitest run (every project) |
| `pnpm test:unit` | `vitest run --project unit` — unit tests only |
| `pnpm test:integration` | `vitest run --project integration --passWithNoTests` — integration tests only |
| `pnpm test:e2e` | `playwright test --grep-invert @live` — Playwright e2e, excluding `@live` |
| `pnpm test:live` | `playwright test --grep @live` — only the `@live` smoke tests |
| `pnpm test:coverage` | `vitest run --coverage` — Vitest run with a v8 coverage report |

:::tip
Run `pnpm lint` and `pnpm typecheck` alongside the tests — they catch unused imports and type errors that the test runner does not.
:::

## Unit tests (Vitest)

Defined as the `unit` project in `vitest.config.ts`. They run in the **happy-dom** environment and pick up any `*.test.ts` / `*.test.tsx` file under `src/`, **excluding** `*.integration.test.*`. `@testing-library/jest-dom` matchers are registered via a setup file, so component and DOM-shaped assertions work out of the box.

These are the fast, dependency-free tests — pure functions (queue serialization, listing-metadata parsing, committed-prefix math) and React component behavior. No database or network is involved.

## Integration tests (Vitest)

Defined as the `integration` project in `vitest.config.ts`. They run in the **node** environment and pick up `*.integration.test.{ts,tsx}` files under `src/` (co-located with the code they exercise — for example the `/api/flow-council/**` route handlers under `src/app/api/flow-council/`).

Integration tests hit a **real Neon Postgres test branch**, not a mock. Key configuration:

- `globalSetup` (`tests/setup/global.ts`) runs `prisma migrate deploy` against the test branch before any test, targeting it via `COUNCIL_DATABASE_URL` (overridden from `TEST_DATABASE_URL`) so production is never touched. It retries on transient Neon/advisory-lock errors.
- `setupFiles` (`tests/setup/integration-env.ts`) loads the per-test environment.
- `fileParallelism: false` — the suite shares a single branch, so files run sequentially to avoid foreign-key races during reset and seed.
- `hookTimeout` and `testTimeout` are raised to 30s to ride out Neon cold-start latency.

You must provide `TEST_DATABASE_URL` (in `.env.test.local` at the repo root) for these to run; without it `globalSetup` throws.

## End-to-end tests (Playwright)

Configured in `playwright.config.ts`. Test files live in **`tests/e2e/`** and match `**/*.e2e.ts`. They run against a real Next.js server with a seeded test database and a **browser-side mock Ethereum provider** — there is no real wallet extension.

How the mock works (see `tests/e2e/README.md` for the full write-up):

- `tests/e2e/setup/global.ts` seeds the database once and writes a fixture JSON to the OS tmpdir; each test reads it for the seeded round/council/project/application IDs.
- Each test calls `installMockWallet(page)`, which exposes a Node-side viem signer (`window.__nodeSign`) for `personal_sign` and injects a fake EIP-1193 provider at `window.ethereum`. The provider presents as MetaMask on **OP Sepolia** (chainId `11155420`) with the address derived from `TEST_PRIVATE_KEY`.
- The sign bridge only signs **Sign-In with Ethereum** messages; `eth_signTypedData_v4` is rejected by design, so EIP-712 flows can't be driven through it.

The covered flows are wallet connection, SIWE sign-in, project creation, application submission, application review, and fund-stream navigation. Run order is sequential (`fullyParallel: false`) because the seeded DB and singleton wallet mock make concurrent runs unreliable.

To run locally, install the browser, provide `.env.test.local`, start the dev server, and run the suite:

```bash
pnpm exec playwright install chromium
pnpm dev
# in another terminal:
pnpm test:e2e
```

The base URL defaults to `http://localhost:3000`; override it with `E2E_BASE_URL` to point at a deployed preview.

### Live smoke tests (`@live`)

Tests tagged `@live` are excluded from the default `pnpm test:e2e` run and selected by `pnpm test:live`. They exercise the same flow against **real OP Sepolia** instead of a CI-safe gated render, so they require testnet access. In CI they run on pushes to `main`, not on every PR.
