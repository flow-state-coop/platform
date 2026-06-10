---
slug: /flow-councils/council-membership
description: Setting Council membership, voter groups, and a voting policy
---

# Council Membership
A **Council** is the set of wallet addresses that may cast votes in a Flow Council round. The round administrator defines a **voting policy** when a round is created:

1. **Who can vote** – a member list of Ethereum addresses
2. **Vote budgets** – the maximum number of votes each member can cast—set individually or globally
3. **Max Vote Spread** – an optional rule that caps how many distinct recipients a voter may support, encouraging more focused allocations

Council admins (and anyone granted the **Voter Review** role) can update membership and the voting policy anytime from the **Membership** page of the Flow Council launchpad. All membership changes are written onchain; large updates are submitted in batches.

## Voter Groups
Membership is organized into **voter groups**. Each group has an **eligibility method** that determines how addresses join it, and a **default vote allocation** applied to members as they're added. A council can have several groups (for example, a curated core team alongside an open community group).

### Manual groups
A **manual** group is a list you curate by hand. Add voters by pasting addresses (one per line) or uploading a CSV in the **Add voters** modal, and set each member's vote budget—either per-address or all at once. Remove a voter and they lose their onchain votes.

### GoodDollar groups (Celo only)
A **GoodDollar** group lets verified [GoodDollar](https://www.gooddollar.org/) identities **self-claim** their spot on the Council—no admin action needed per voter. New claimants are automatically added with the group's default vote allocation.

Because adding voters happens automatically, a Flow State–sponsored bot needs permission to manage membership. When you create a GoodDollar group, you'll be prompted to grant that bot the **Voter Review** role in a single transaction. Self-claim works only while the bot holds that role, so revoking it is the kill switch for automated eligibility. GoodDollar groups are available only on **Celo**.

:::tip[Single membership]
An address belongs to **one** group per council. Adding an address that already votes in another group of the same council is skipped rather than duplicated.
:::

## Automated eligibility
Beyond GoodDollar, Flow State offers flexible infrastructure to support automated voting policies based on onchain or offchain conditions (with some light development). For example, “any address that holds a *Community NFT* is automatically added to the Council with 100 votes.” [Reach out on Telegram](https://t.me/flowstatecoop) if you'd like to wire up a custom policy.
