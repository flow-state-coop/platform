---
slug: /flow-councils/funding
description:
  Sponsoring the funding stream, managing the SuperApp Splitter, and scheduling
  the round end
---

# Funding

The **Funding** page of the launchpad is where operators manage the money
flowing into a Flow Council. Funding actions are available for councils with a
SuperApp Splitter—every council launched going forward has one.

## The SuperApp Splitter

Launching a council also deploys its **SuperApp Splitter**—a stream-forwarding
contract that sits between funders and the council's distribution pool. All
incoming funding streams—the operator's sponsor stream and permissionless
[Grow the Pie](../participants/004-grow-the-pie.md) streams—route through the
splitter, which forwards them to the pool. That indirection is what gives
operators control over the round's lifecycle:

- **Close the round.** Admins can close all incoming streams on behalf of every
  funder—something that isn't possible with streams opened directly to the pool.
- **Enforce an end date.** Once a scheduled end date passes, the splitter
  rejects new incoming streams.
- **Collect the platform sustainability fee.** A small portion of the flow
  accrues in the contract until round close. The exact fee is shown on the
  Funding page.

The splitter must always hold a small balance of the distribution token (at
least four hours' worth at the current funding rate) to keep its outgoing stream
solvent.

The page's information panel shows the splitter's address, the sustainability
fee, the contract's current balance, the **implied max funding rate** that
balance can support, and the round status (**Open**, **Open – Ends [date]**, or
**Closed**).

## Sponsor stream

Open the round's funding stream by entering a monthly flow rate. The checkout
flow wraps underlying tokens into the Super Token if needed and tops up the
splitter's buffer in the same batch transaction. The flow rate can be raised or
lowered anytime as more funding becomes available or circumstances change.

## Top up the splitter

The splitter's balance caps the total funding rate it can sustain. The transfer
section lets you make a one-time deposit to raise the implied max funding rate
without opening or changing a stream.

## Round end date

By default, rounds are open-ended. Here you can **schedule** an end date,
**reschedule** it, or **remove** it. After the end date passes, the round shows
as **Closed** and the splitter stops accepting new incoming streams;
rescheduling to a future date or removing the date re-opens the round.

## Close all streams

The danger zone at the bottom of the page closes **every** incoming stream to
the splitter in a single action—the definitive way to end a round. Closing is
batched (up to 1,000 streams per transaction), so very large rounds may need
more than one pass. You'll be asked to type a confirmation before the
transaction is submitted.

:::note[Splitter roles] The splitter has its own onchain roles, separate from
the [council roles](002-permissions.md). The deploying wallet is set as the
splitter's admin and stream admin at launch; scheduling the round end and
closing all streams require one of those roles. :::
