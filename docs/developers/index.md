---
slug: /developers
description: Build on and contribute to the Flow State platform
sidebar_position: 1
---

# Developers

The **Flow State platform** is the open-source Next.js application behind [flowstate.network](https://flowstate.network) — the app that powers Streaming Quadratic Funding rounds, Flow Splitters, and Flow Councils on top of [Superfluid](https://docs.superfluid.org).

The full source lives at **[github.com/flow-state-coop/platform](https://github.com/flow-state-coop/platform)**. It is a TypeScript monorepo-free Next.js 15 App Router app: wallet-native (wagmi + viem + RainbowKit), authenticated with **Sign-In with Ethereum**, reading on-chain state through per-chain subgraphs and persisting off-chain metadata in Postgres via Prisma.

These pages are written for developers who want to run the app locally, understand how it is put together, consume its public API, or contribute code and docs.

- **[Getting Started](002-getting-started.md)** — prerequisites, environment variables, and running the app and database locally.
- **[Architecture](003-architecture.md)** — the stack, the `src/` layout, the data model, and the supported networks.
- **[Public API](004-public-api.md)** — the unauthenticated endpoints you can build against.
- **[Metrics API](005-metrics-api.md)** — the authenticated endpoint for pushing automated ballots to a metrics voter group.
- **[Contracts](006-contracts.md)** — the on-chain contracts the platform reads and writes.
- **[Testing](007-testing.md)** — unit, integration, and end-to-end test workflows.
- **[Contributing](008-contributing.md)** — how to open a PR and where the docs live.

:::tip
The package manager is **pnpm**. Every command in these docs assumes you have it installed.
:::
