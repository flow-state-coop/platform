---
slug: /streaming-qf/donors
description: How-to Guide for Streaming Quadratic Funders.
---

# Donors

Grants on Flow State are streamed. 

Instead of in one-off or batch transactions, we use programmable money to its full potential to dynamically & continuously allocate funding.

This guide will introduce you to the core concepts of streaming grants and see a new way of delivering, recognizing, and creating value.

## Superfluid & Super Tokens

There are several money “streaming” protocols available in web3, but we use [Superfluid](https://docs.superfluid.finance/docs/concepts/superfluid). Superfluid is built with a token-centric streaming model. Under this model, you can open multiple, open-ended streams from a single *Super Token* balance. This approach delivers real-time composability (stream to stream to stream to…) and high capital efficiency (streams don’t have to be fully collateralized) that deposit-contract streams can’t match.

[Super Tokens](https://docs.superfluid.finance/docs/concepts/overview/super-tokens) are Superfluid’s extension of the ERC20 token standard (i.e. they inherit the traditional functions of ERC20 but have additional transfer methods such as streaming). 

There are two Super Token types: 

- **Wrapper Super Tokens:** Created by wrapping an existing token (akin to ETH & WETH). This new wrapped token is typically identified by adding “x” to the end of the underlying token ticker and referred to as “Super [Token Name]” (e.g. DAIx, Super DAI).
- **Pure Super Tokens:** Launched natively with Superfluid capabilities and no separate underlying token.

:::tip[Streaming Network Effects]
Dapp and user adoption of Super Tokens will drive positive network effects—less wrapping/unwrapping, more composability, and higher capital efficiency.
:::

Most Flow State grant rounds will launch using wrapper Super Tokens like ETHx, DAIx, USDCx, ARBx, and OPx for direct donations and matching pools. You’ll likely need to perform a wrapping transaction the first time you open a donation stream. The Flow State grant checkout flow will walk you through that process step-by-step:

Flow State uses a conditional checkout flow helping you buy, swap, and/or wrap sufficient donation tokens based on your stream rate, token balances, & the Super Token type.

You can’t stream what you don’t have. So just like ERC20s, your Super Token balance can’t go below 0. The Superfluid protocol enforces this by requiring a small upfront deposit (typically equal to 4 hours at the proposed stream rate) every time you open a stream. If your net balance reaches zero, that deposit will incentivize the liquidation/closing of your stream and keep the protocol solvent. 

Especially as you maintain more open streams, keep an eye on your Super Token balances. The [Superfluid App](https://app.superfluid.finance/) is great for managing your balances between funding actions.

## Donations as Votes

Flow State is a platform for collectively and effectively allocating resources to people, projects, and causes. Opinions, preferences, and engaged expertise are the lifeblood of this process.

As we continue to develop novel streaming allocation strategies, decision-making input will primarily take on two forms:

1. **Direct Donations:** Voting with financial units
2. **Voting:** Voting with scarce, non-financial units

Both are expressions of user preference with different tradeoffs and effective contexts that operators will weigh as they launch their rounds. The round’s grant checkout flow will guide you through the appropriate steps to make your voice heard.

Flow State direct donations & voting utilize an eligibility check to help combat inefficient funding allocation. 

### Opening an SQF Donation Stream

!(https://www.youtube.com/embed/xZ8ojwyWC8I)

Donation streams impact grantee funding in two ways—directly and through matching. The more broadly a grantee is supported the higher their matching multiplier will be. 

Each grantee card on the round UI will show the impact you can have with ~$1/month equivalent donation stream, so be on the lookout for those x100 gems:

1. Click the “Donate” button on your grantee of choice.
2. Enter the stream rate at which you want to support the grantee.
3. Top-up the necessary gas token and/or donation token (Fiat onramp and DEX links are provided for convenience, but use whatever tools you’re comfortable with).
4. Enter the desired amount of Super Token to wrap.
    1. We suggest at least 3 months’ worth at the proposed new stream rate.
5. Confirm your eligibility for matching.
    1. See the following section for details.
6. Review & sign the proposed transaction(s).
    1. If you’re wrapping more Super Tokens, you’ll have two transactions to sign. If you’re only editing your donation stream, just one.
    2. The impact your stream will have on the grantee’s matching allocation is previewed as well.
7. Use the social links to share your public goods support with your network.

### Eligibility

Flow State currently offers round operators two methods to define direct donor/voter eligibility criteria:

1. **ERC-721:** Under this method, users must hold at least 1 NFT in an operator-defined ERC-721 contract. The round operator may manually distribute, set conditions, or openly mint the NFT. The grant round UI checkout flow will include a link with instructions to obtain the NFT (if the round operator chooses). Typically, these tokens will be non-transferable. 
2. [**Passport (Onchain)**](https://support.passport.xyz/passport-knowledge-base): Passport (formerly Gitcoin Passport) uses an identity stamp & score-based approach to Sybil resistance. Users can generate a diverse set of verifiable credentials through the service. Flow State uses [the onchain version of Passport](https://support.passport.xyz/passport-knowledge-base/using-passport/onchain-passport) (which requires a small minting fee) for its fully onchain system. Each verifiable credential (stamp) adds to the user’s “Unique Humanity Score.” Round operators can set the minimum score required for participation in the round (typically between 10 & 20).

## Matching Pool Donations

On Flow State, matching pool donations aren’t just for whales. 

They’re permissionless. They’re immediate. They’re easy. They’re efficient.

Direct donations in Streaming Quadratic Funding create an ever-evolving collective intelligence that matching donors *get to* tap into to grow the pie. We refer to the community’s current allocation weight as their Flow State.

Donating to the matching pool amplifies the Flow State. It's an onchain superpower to open a single stream and have it allocated to deserving public goods in real-time based on onchain quadratic funding weights.

### Opening an SQF Matching Stream

!(https://www.youtube.com/embed/-_i4Priiwbc)

Adding to an SQF matching pool is even easier than making a direct donation (because it’s not subject to eligibility/Sybil checks):

1. Navigate the home page for any Flow State grant round
2. Click the “Grow the Pie” button in the header
3. Follow the step-by-step instructions for opening a matching stream
4. Every grantee in the round receives more funding based on the Flow State

## Managing Streams & Super Token Balances

Streaming is a continuous value transfer method--meaning streams impact your Super Token balance between transactions.

![Stream Graph Example](https://github.com/user-attachments/assets/39ee6f89-bbd1-45ec-a372-25d78c8ceaa1)

Streams transfer tokens at their set rate until increased, decreased, or closed with another transaction. 

You can modify your stream or close it at any time.

:::danger[Insufficient Funds to Stream]
You can't stream tokens you don't have! 

If your Super Token balance hits 0, your outgoing streams will be closed. [You will lose the buffer deposit(s) collected when you opened the stream(s).](https://help.superfluid.finance/en/articles/5744874-how-do-stream-buffers-work-in-superfluid) These buffer deposits & forfeiture help keep protocol stays solvent.

You should close and/or lower your streams before your token balance reaches 0 to avoid losing your deposits.
:::

### Closing a Matching Stream

<img width="359" alt="Cancel Stream" src="https://github.com/user-attachments/assets/b365039b-b14a-4865-983d-5d7429bd9744" />

1. Click `Grow the Pie`
2. Enter `0` for your stream rate
3. Click `Cancel Stream`
4. Proceed through the rest of the checkout flow and sign the transaction

### Closing a Direct Donation Stream

<img width="286" alt="Your Stream" src="https://github.com/user-attachments/assets/c272287c-35ad-4c97-aafe-aa96cdf6bdb5" />

1. Click `Donate` on the grantee that you want to cancel a stream to
    - Grantees that you are currently streaming to will have a **Your Stream** value 
2. Enter `0` for the new stream rate
3. Click `Cancel Stream`
4. Proceed through the rest of the checkout flow and sign the transaction
