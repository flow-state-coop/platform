---
slug: /developers/architecture
description: Stack, directory layout, data model, and supported networks
---

# Architecture

This page is a map of how the **Flow State platform** is put together — enough to find your way around the codebase, not an exhaustive reference.

## Stack

- **Next.js 15** App Router on **React 19**, written in **TypeScript** (strict mode).
- **wagmi** + **viem** for all on-chain reads and writes, with **RainbowKit** for the wallet connection UI.
- **NextAuth** with **Sign-In with Ethereum (SIWE)** for authentication — protected API routes verify a SIWE session and check on-chain or DB-backed roles.
- **Apollo Client** querying GraphQL **subgraphs**, one per chain. `src/lib/apollo.ts` lazily builds and caches a client per `(apiType, chainId)` pair against the right subgraph URL from `src/lib/networks.ts`.
- **Prisma** (schema + migrations) generating **Kysely** types into `src/generated/`; runtime queries run through Kysely on **Neon** serverless Postgres.
- **Superfluid** via the **`@sfpro/sdk`** plus the protocol's GDA/CFA forwarder contracts for streaming money flows.

## Directory layout

Everything lives under `src/`:

- **`app/`** — Next.js App Router. Pages and route groups (e.g. `flow-councils/`, `flow-splitters/`) plus the backend under `app/api/` (notably `app/api/flow-council/`).
- **`components/`** — shared, cross-feature React components.
- **`context/`** — React context providers (e.g. `context/FlowCouncil.tsx`, which wires subgraph hooks into a council's voting state via discriminated-union reducers).
- **`hooks/`** — shared React hooks. Feature-specific hooks also live alongside their feature (e.g. `app/flow-councils/hooks/`).
- **`lib/`** — framework-light utilities and configuration: `networks.ts`, `apollo.ts`, constants, helpers.
- **`types/`** — shared TypeScript types (`network.ts`, `token.ts`, etc.).
- **`generated/`** — Prisma-generated Kysely types (`kysely.ts`). Do not hand-edit; regenerate with `pnpm db:generate`.

## Data model

Off-chain metadata lives in Postgres. The schema is `prisma/schema.prisma`; migrations are in `prisma/migrations/`. The main tables:

- **Round** — a Flow Council round, keyed by `(chainId, flowCouncilAddress)`. Holds the on-chain council/splitter addresses and a JSON `details` blob (round metadata, visibility, form schema).
- **RoundAdmin** — admin addresses for a round, one row per `(roundId, adminAddress)`; backs the SIWE admin checks.
- **Project** — a reusable project profile (JSON `details`) that can apply to many rounds.
- **Application** — a project's application to a round (`status`, JSON `details`, funding address); unique per `(projectId, roundId)`.
- **Recipient** — marks an application as an accepted recipient in the distribution pool (one-to-one with Application).
- **MilestoneProgress** — per-application milestone updates, keyed by `(applicationId, milestoneType, milestoneIndex)` with a JSON `progress` payload.
- **Message** — feed/channel messages, scoped by `channelType` to a round, project, or application; supports pinning and reactions.
- **UserProfile** — per-address display name, bio, social handles, and email-notification preferences/consent state.
- **InboxItem** — per-recipient inbox entries (category, snippet, read state) linking to messages and applications.
- **VoterGroup** — a named voter group within a round with an `eligibilityMethod` (`manual` or `gooddollar`) and a default voting power.
- **VoterGroupMember** — a voter's membership in a group; single-membership per round is enforced by `UNIQUE(roundId, address)`.

## Networks

Supported chains are defined in `src/lib/networks.ts`. Each `Network` entry carries its RPC URL, block explorer, Superfluid + Flow Splitter + Flow Council subgraph URLs, core contract addresses, and supported Super Tokens.

| Network | Chain ID | Type |
| --- | --- | --- |
| Arbitrum One | 42161 | mainnet |
| Base | 8453 | mainnet |
| Celo | 42220 | mainnet |
| Optimism | 10 | mainnet |
| OP Sepolia | 11155420 | testnet |

:::info
Some features are chain-gated. For example, GoodDollar voter eligibility is **Celo-only**, and Flow Councils run on the chains flagged by `isFlowCouncilNetwork` in `networks.ts`. Always look up a network by `id` rather than assuming a fixed order.
:::
