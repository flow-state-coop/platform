---
slug: /flow-splitters/recipients
description: How to manage funding from Flow Splitters.
---

# Recipients

There are two tokens relevant to each Flow Splitter:

1. Shares - Flow Splitter-specific tokens that are used to allocate distributions proportionally.
2. Distribution Token - The _Super Token_ streamed & distributed through the Flow Splitter.

## Shares

Each Flow Splitter is based on its own ERC20 token. Like other ERC20 tokens, they can have a name and a token symbol. You can add them to display in your wallet from the Flow Splitter homepage or copy/paste the contract address into your wallet’s add token tool.

But, these tokens can be thought of more like onchain stock than a currency.

Holding these tokens earns you a proportional allocation of all future cash flows through the corresponding Splitter (Gary is gone, but to be clear, this is a conceptual framing–not an endorsement of Flow Splitter shares as investment contracts).

These shares may or may not be transferable depending on how your Flow Splitter admin set them up. It’s also important to note that any admins on your Flow Splitter can edit the Share Registry anytime.

## Connecting Shares

Recipients added to a Flow Splitter must complete a one-time transaction to begin seeing corresponding distributions reflected in their real-time token balance. If distributions are made before the recipient completes this transaction, the funds are safe and will be made available upon connection.

If you’re signed in with a recipient wallet, we’ll remind you to complete this transaction when you visit a Flow Splitter page. You can also check your [Flow Splitter list](https://flowstate.network/flow-splitters) for disconnected shares.

:::info[Why do I need to connect my shares?]
Superfluid may seem like magic, but it’s really just clever use of math onchain.

A core innovation of Superfluid is that a token balance need not be represented by just a static number (e.g. 12). This is what the ERC20 standard implements. A token balance could also include parameters like a flow rate and time (e.g. 12 + 2\*t where t = _current time - previous transaction time_). This is what Superfluid Super Tokens do to extend the ERC20 standard. This approach enables gasless value transfer (because as much as you might want to stop it, time keeps moving forward).

So while the example above is simplified from the actual protocol implementation, it's fair to think of the transaction to connect your shares (and other streaming transactions) as updating your token balance formula.

Yay, programmable money! 
:::

## Super Tokens

[Super Tokens](https://docs.superfluid.finance/docs/concepts/overview/super-tokens) are Superfluid’s extension of the ERC20 token standard. Every Flow Splitter is associated with just one of these tokens. They are the _currency_ that is distributed through the Flow Splitter.

Super Tokens are often a wrapped version of an existing token (but there are “pure” deployments too–see the link above for details). They can be identified by an “x” at the end of a familiar ticker (e.g. ETHx is the Super Token version of ETH like wETH is an ERC20-wrapped version of ETH).

Once you’ve connected your Flow Splitter shares, you’ll be paid onchain with the Super Token in real time. Your tokens are available immediately to spend with each instant distribution and/or as time passes with an open streaming distribution (i.e. your onchain Super Token balance will update without further action).

Rest assured, you don’t _need_ to unwrap your Super Token to access your funds. You can transfer, stream, or use them as-is in other exciting applications on Flow State and in the [Superfluid ecosystem](https://www.superfluid.finance/ecosystem). You can unwrap them 1:1 with the underlying token [from the Superfluid App](https://app.superfluid.finance/wrap?downgrade) anytime.

We recommend adding your Flow Splitter’s distribution token to your wallet and/or check out the [Superfluid App](https://app.superfluid.finance/) to see and manage your balance.

:::tip[Finding & Creating Super Tokens] 
A full list of deployed Super Tokens across networks is available on the [Superfluid Explorer](https://explorer.superfluid.finance/base-mainnet/supertokens).

You can also permissionlessly [launch your own “pure” Supertoken](https://docs.superfluid.finance/docs/protocol/super-tokens/guides/deploy-super-token/deploy-pure-super-token) or [deploy a “wrapper” for your favorite token to become Superfluid-enabled](https://docs.superfluid.finance/docs/protocol/super-tokens/guides/deploy-super-token/deploy-wrapped-super-token). 
:::