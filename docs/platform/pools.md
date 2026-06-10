---
slug: /pools
description: View and manage raw Superfluid distribution pools
sidebar_position: 7
---

# Pools

The **Pools** view at [`flowstate.network/pools`](https://flowstate.network/pools) is an advanced, low-level interface onto raw Superfluid [distribution pools (GDA)](https://docs.superfluid.finance/docs/concepts/overview/distributions). It lets you look at—and, if you're the admin, manage—any distribution pool by its contract address, without the higher-level scaffolding that purpose-built tools add.

:::tip[Most people want a wrapper, not raw pools]
[Flow Splitters](flow-splitters/index.md) and [Flow Councils](flow-councils/index.md) are friendlier, purpose-built wrappers over these same distribution pools. They add no-code management, metadata, member tooling, and onchain/offchain enhancements. Reach for the raw Pools view only when you need to inspect or operate a pool directly.
:::

## Finding a pool

On the entry page you:

1. Pick a **network** from the dropdown. Switching network prompts you to connect your wallet (and switches its chain) if needed.
2. Paste the **pool contract address** (`0x...`).

The address is validated against the chosen network—it reads the pool's `superToken` onchain, and if the address isn't a valid Superfluid distribution pool there, you'll see `Not a valid Superfluid distribution pool on this network`. Once it checks out, **View Pool** takes you to the pool's detail page at `/pools/<chainId>/<poolAddress>`.

## Viewing a pool

The detail page shows the pool's name (or just **Distribution Pool**) alongside its truncated address, which links out to the pool on the Superfluid Explorer, plus the **Super Token** it distributes and the network it lives on. From here you can:

- See the pool's **members**, their **units** (shares), and whether each member is **connected**.
- See current **distributors** and their **flow rates**, and read an **activity feed** of distributions and member-unit changes.
- **Add to Wallet** — register the distributed Super Token in your wallet.
- **Open Flow** — start (or update) a stream into the pool, so your tokens get split across members in real time.
- **Send Distribution** — push a one-off instant distribution to the pool's members.

### Connecting to a pool

If you're a member of the pool but haven't connected your shares, you'll be prompted to connect. Connecting (a single transaction) makes your share of the distributed [Super Token balance](https://app.superfluid.finance/) reflect in real time in your wallet, instead of needing a manual claim.

## Admin view

From a pool's detail page you can open its **Configuration** (admin) view at `/pools/<chainId>/<poolAddress>/admin`. It surfaces the pool's fixed-at-deployment settings—token, **Pool Admin**, and **Share Transferability** (whether recipients can transfer their shares)—as read-only, plus the editable **Share Register**.

The Pool Admin (the address that deployed the pool) can edit the share register to:

- Add recipients and set each one's **shares** (units); a live **%** column shows each recipient's portion of the total.
- Remove a recipient by setting their shares to `0`.
- Bulk-edit via **CSV**: **Export Current** to download the member list, then **Upload CSV** to replace it.

Changes are batched into a single **Update Pool** transaction. If you aren't the admin, the register is read-only.

:::info[What is streaming money?]
Check out the [Superfluid Docs](https://docs.superfluid.finance/docs/concepts/superfluid) to learn more about [Super Tokens](https://docs.superfluid.finance/docs/concepts/overview/super-tokens), [distribution pools](https://docs.superfluid.finance/docs/concepts/overview/distributions), and other protocol foundations.
:::
