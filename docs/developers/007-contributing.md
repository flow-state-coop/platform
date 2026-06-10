---
slug: /developers/contributing
description: Contributing code and docs
---

# Contributing

Contributions to the **Flow State platform** are welcome. This page covers the basics of opening a pull request and — importantly — where the documentation lives.

## Code

Branch from **`main`**, make your change, and before opening a PR run the full local check suite:

```bash
pnpm lint        # next lint
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
```

All three must pass. `pnpm lint` enforces `no-unused-vars`, so a stray import will fail the build. See [Testing](006-testing.md) for the integration and end-to-end suites.

:::tip
Run the checks before you push, not after CI flags them — `pnpm typecheck` catches issues `pnpm lint` doesn't, and vice versa.
:::

## Docs

The documentation you are reading lives in **`docs/` inside this platform repo**, and that copy is the **single source of truth**.

A GitHub Action — [`.github/workflows/sync-docs.yml`](https://github.com/flow-state-coop/platform/blob/main/.github/workflows/sync-docs.yml) — mirrors the `docs/**` tree into the **[`flow-state-coop/docs`](https://github.com/flow-state-coop/docs)** repository (the Docusaurus site published at **docs.flowstate.network**). On every merge to `main` that touches `docs/**`, the workflow `rsync`s the tree across and **opens a pull request** on the docs repo, which Vercel builds a preview for and publishes on merge.

:::warning
**Edit docs in `platform/docs/`, never directly in the docs repo.** Anything you change in `flow-state-coop/docs` will be overwritten by the next sync. The docs repo only holds the Docusaurus scaffolding (sidebars, config, theme); the markdown is generated from here.
:::

The docs are a **Docusaurus 3** site, so follow its conventions:

- **Numbered-prefix filenames** (e.g. `003-architecture.md`) control sidebar order.
- Each page starts with frontmatter — at minimum a **`slug:`** and a **`description:`**.
- Use **admonitions** (`:::tip`, `:::info`, `:::warning`, closed with `:::`) for callouts.
- Cross-link sibling pages with relative `.md` links, e.g. `[Architecture](003-architecture.md)`.
