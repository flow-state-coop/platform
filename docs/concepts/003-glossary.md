---
slug: /concepts/glossary
description: Key terms used across Flow State
---

# Glossary

Key terms used across Flow State and the underlying Superfluid protocol. Protocol primitives link out to the [Superfluid Docs](https://docs.superfluid.finance/docs/concepts/superfluid); product terms link to the relevant [Platform](../platform/flow-councils/index.md) page.

## Streaming primitives

**Stream** — A continuous, real-time transfer of tokens from a sender to a receiver. Once opened, a stream moves money every second with no further transactions until it is changed or closed. See [money streaming](https://docs.superfluid.finance/docs/concepts/overview/money-streaming).

**Flow rate** — The speed of a stream, expressed as an amount of tokens per second. Raising, lowering, or zeroing a `flow rate` is how you adjust a stream over time. In a Flow Council, a recipient's flow rate is determined by the votes they receive.

**Super Token** — A Superfluid-wrapped ERC-20 that streams and distributions operate on. Any standard token can be wrapped into its Super Token to be streamed. See [Super Tokens](https://docs.superfluid.finance/docs/concepts/overview/super-tokens).

**CFA (Constant Flow Agreement)** — The Superfluid agreement that powers one-to-one streams. It holds a sender's `flow rate` to a receiver constant until updated, which is what makes a stream continuous and predictable.

**GDA (General Distribution Agreement) / Distribution Pool** — The Superfluid agreement behind one-to-many distributions. A **distribution pool** splits an incoming stream (or one-off transfer) proportionally among its members according to the `units` each holds. Flow Splitters are enhanced distribution pools. See [distributions](https://docs.superfluid.finance/docs/concepts/overview/distributions).

**Units / Shares** — A distribution pool member's stake in that pool. The pool's total flow is split in proportion to each member's `units` (also called shares), so a member with twice the units of another receives twice the flow.

## Flow State tools

**Flow Splitter** — An onchain and offchain enhanced Superfluid distribution pool with a no-code interface. It enables scalable one-to-many token distributions: a stream or transfer is split proportionally across recipients by the shares each holds, with passive, gasless settlement once shares are connected. See [Flow Splitters](../platform/flow-splitters/index.md).

**Flow Council** — A tool for continuous, participatory funding allocation. Council Members vote to split a single stream of money across an arbitrary number of recipients, and budgets can be re-allocated in real time as priorities and results evolve. See [Flow Councils](../platform/flow-councils/index.md).

**Council Member** — A participant in a Flow Council who holds `voting power` and casts a ballot to direct the council's outgoing stream. Members are managed onchain; their `votingPower` determines how much weight their votes carry.

**Voting power** — The weight assigned to a Council Member's votes. A member allocates their voting power across recipients on their ballot; the combined allocations across all members set each recipient's flow rate. Removing a voter is done by setting their voting power to zero.

**Ballot** — A Council Member's set of votes — the recipients they're supporting and how much of their voting power goes to each. Updating a ballot updates the corresponding outgoing streams going forward.

**Recipient / Grantee** — An account that receives a stream from a Flow State tool. In a Flow Council, recipients (often called **grantees** when a council funds projects) receive a flow proportional to the votes they've been allocated.

## Streaming Quadratic Funding

**Round** — A funding cycle. With Streaming Quadratic Funding, a round can be open-ended or run far longer than a traditional periodic round, since matching is distributed continuously rather than only after the round closes. See [Streaming Quadratic Funding](../platform/streaming-qf/index.md).

**Streaming Quadratic Funding (SQF)** — Quadratic funding with a streaming architecture. Donations are structured as open-ended money flows rather than one-off transfers, and a quadratic matching formula continuously allocates pool funds based on these streamed "votes." Donors can change their streams anytime, and the matching streams update in real time. See [Streaming Quadratic Funding](../platform/streaming-qf/index.md).

## Discovery

**Listed / Unlisted** — Whether a round or pool appears in Flow State's public discovery surfaces. All rounds and pools default to **Unlisted** (opt-in); marking one **Listed** opts it into being surfaced. The flag does not affect functionality — an Unlisted round still works exactly the same for anyone with the link.
