---
slug: /developers/getting-started
description: Run the Flow State platform locally
---

# Getting Started

This page walks you through running the **Flow State platform** on your machine.

## Prerequisites

- **Node.js** 20 or newer (the repo pins `@types/node` to v20).
- **[pnpm](https://pnpm.io)** — the project's package manager. Do not use `npm` or `yarn`; the lockfile is `pnpm-lock.yaml`.
- A **Postgres** database. Production uses [Neon](https://neon.tech) serverless Postgres, and the app talks to it through the `@neondatabase/serverless` driver, so a Neon branch is the closest local match.

## Clone and configure

```bash
git clone https://github.com/flow-state-coop/platform.git
cd platform
cp .env.sample .env
```

### Environment variables

`.env.sample` ships the variables the app reads. Fill them in your `.env` — names only below, never commit real values:

- **`NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`** — WalletConnect Cloud project id used by RainbowKit for wallet connections. Public (build-inlined).
- **`NOTIFICATION_HMAC_SECRET`** — HMAC signing secret for email notification preference and unsubscribe tokens. The notification token module throws if it is unset.
- **`PLATFORM_MESSAGE_SECRET`** — bearer secret guarding the platform-message admin endpoint. The route returns `401` if it is unset.

:::info
You will also need a Postgres connection string for Prisma. Prisma reads it from its standard `DATABASE_URL` environment variable; point it at your Neon (or local) database before running any `db:*` script.
:::

## Install and run

```bash
pnpm install
pnpm dev
```

The dev server starts on **[http://localhost:3000](http://localhost:3000)**.

## Database workflow

The schema lives in `prisma/schema.prisma`. Prisma generates **Kysely** types (via `prisma-kysely`) into `src/generated/kysely.ts` — the app queries Postgres through Kysely, not the Prisma client — so regenerate types whenever the schema changes.

```bash
pnpm db:generate   # prisma generate — regenerate the Kysely types in src/generated/
pnpm db:migrate    # prisma migrate dev — create/apply a migration against your dev DB
pnpm db:deploy     # prisma migrate deploy — apply pending migrations (CI / production)
```

A typical loop: edit `schema.prisma`, run `pnpm db:migrate` to create a migration under `prisma/migrations/`, then `pnpm db:generate` to refresh `src/generated/kysely.ts`.

:::warning
In production, run `pnpm db:deploy` **before** deploying the new app code so the tables exist when the new code runs. `db:migrate` is for local development only — it can prompt and reset, which you never want against a shared database.
:::
