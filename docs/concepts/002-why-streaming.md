---
slug: /concepts/why-streaming
description: Why continuous, real-time money streams beat batch payments
---

# Why Streaming?

Most onchain funding still moves the way it did in the age of paper checks: in **lump sums**. A grant is approved, a transfer is signed, and a fixed amount lands all at once. The decision and the disbursement happen in a single moment — and then everyone moves on.

That batch model creates a gap between **capital** and **results**. The money is committed up front, based on what you knew at the time, but the work it pays for unfolds over weeks or months. By the time results come in, the allocation is already locked. To respond to new information you have to wait for the next round, re-open governance, and sign another transfer.

**Streaming money closes that gap.** Instead of a one-off transfer, a **stream** moves a continuous flow of tokens from sender to receiver, every second, with no further transactions. In web3, money and information already travel on the same rails — and every batch payment is a missed chance to connect them. Streaming funding lets you, your team, and your community keep capital and results in sync.

Three properties make streams a better funding primitive:

- **Real-time.** Funds arrive continuously rather than in periodic drops. Recipients get capital velocity and predictable cash flow; they can plan and spend as the work happens instead of waiting for the next payout.
- **Adjustable.** A stream's `flow rate` can be changed at any time. As priorities shift or results come in, you raise, lower, redirect, or stop the flow going forward — no need to claw back a transfer or wait for a new round.
- **Composable.** Streams are onchain primitives. They can be split, pooled, matched, and wired into other contracts and signals, so a single inbound flow can fan out to many recipients or react automatically to onchain activity.

## From primitive to product

Flow State turns streaming money into tools you can launch without writing contracts:

- **[Flow Councils](../platform/flow-councils/index.md)** make allocation continuous and participatory. **Council Members** vote to split a single stream across an arbitrary number of recipients, and they can re-allocate in real time as priorities evolve and results are demonstrated. It's a fit for grants programs, organizational budgeting, and any collective allocation process that should be able to adapt.
- **[Flow Splitters](../platform/flow-splitters/index.md)** make one-to-many payouts effortless. Built on Superfluid distribution pools, they proportionally split an incoming stream across recipients by the `shares` each holds. Settlement is passive and gasless — once a recipient connects their shares, distributions arrive in real time with no manual withdrawals.
- **[Flow QF](../platform/flow-qf.md)** makes public-goods funding open-ended. Donations become continuous flows instead of one-off votes, and a quadratic matching formula continuously allocates the pool. Rounds can run indefinitely, grantees get steadier funding, and the democratic outcome adjusts to changing preferences in real time.

Each is a different application of the same idea: money that moves like information, so funding can respond as fast as the world it's funding.

:::info[What is streaming money?]
Check out the [Superfluid Docs](https://docs.superfluid.finance/docs/concepts/superfluid) to learn more about [money streaming](https://docs.superfluid.finance/docs/concepts/overview/money-streaming), [Super Tokens](https://docs.superfluid.finance/docs/concepts/overview/super-tokens), [distribution pools](https://docs.superfluid.finance/docs/concepts/overview/distributions), and other protocol foundations.
:::
