# Testing

Automated test setup for the platform. See `~/Downloads/testing-strategy.md` for the full strategy doc this implements.

## Stack

- **Vitest** — unit & integration runner (native ESM/TS, React 19 compatible)
- **@testing-library/react** + **happy-dom** — component tests
- **@vitest/coverage-v8** — coverage reports

Future phases will add Playwright (E2E), Neon test branch (DB integration), and onchain mocks.

## Running tests

```bash
pnpm test              # run everything
pnpm test:unit         # fast, no external deps
pnpm test:integration  # requires DB (Phase 2+)
pnpm test:coverage     # with coverage report
```

In watch mode during development:

```bash
pnpm vitest            # interactive watch
```

## File conventions

- **Colocate** test files next to the source: `src/lib/utils.ts` → `src/lib/utils.test.ts`
- **Unit tests**: `*.test.ts` / `*.test.tsx` — pure functions, hooks, components. No DB, no network.
- **Integration tests**: `*.integration.test.ts` — touch the Neon test branch or other external systems. Excluded from `test:unit`.
- Use the `@/` path alias the same way as the rest of the codebase.

## What to test (and what not to)

**Always test**
- Pure functions (math, formatters, parsers, calldata builders)
- Zod schemas
- Reducers and discriminated-union state machines
- API route handlers (with mocked session + DB)

**Mock**
- `wagmi` hooks in component tests
- Apollo subgraph queries via fixtures (Phase 3)
- viem `PublicClient` reads via a `mockPublicClient` helper (Phase 3)
- `getServerSession` in API route tests

**Don't automate**
- Onchain writes (calldata builders are pure — test those instead)
- Wallet UX combinatorics (manual spot checks)
- Real email delivery, real RPC latency (manual spot checks)

## Project structure

`vitest.config.ts` defines two projects:

- `unit` — `happy-dom` env, matches `src/**/*.test.{ts,tsx}`, excludes integration files
- `integration` — `node` env, matches `src/**/*.integration.test.{ts,tsx}` (empty until Phase 2)

## Verification before commit

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
```
