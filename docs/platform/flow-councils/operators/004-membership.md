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

![Voter groups](./img/membership.png)

*Voter groups and their share of votes.*

Membership is organized into **voter groups**. Each group has an **eligibility method** that determines how addresses join it, and a **default vote allocation** applied to members as they're added. A council can have several groups (for example, a curated core team alongside an open community group).

### Manual groups
A **manual** group is a list you curate by hand. Add voters by pasting addresses (one per line) or uploading a CSV in the **Add voters** modal, and set each member's vote budget—either per-address or all at once. Remove a voter and they lose their onchain votes.

### GoodDollar groups (Celo only)
A **GoodDollar** group lets verified [GoodDollar](https://www.gooddollar.org/) identities **self-claim** their spot on the Council—no admin action needed per voter. New claimants are automatically added with the group's default vote allocation.

Because adding voters happens automatically, a Flow State–sponsored bot needs permission to manage membership. When you create a GoodDollar group, you'll be prompted to grant that bot the **Voter Review** role in a single transaction. Self-claim works only while the bot holds that role, so revoking it is the kill switch for automated eligibility. GoodDollar groups are available only on **Celo**.

### Metrics groups
A **metrics group** delegates a configurable share of a council's allocation to an automated data-driven policy. It adds the **F(S) Automation Bot** as a plain on-chain voter with an admin-set voting power equal to the share you want the policy to control. The bot requires no special role; it only casts its own ballot.

An external caller (a Dune query, cron job, or any HTTP client) then pushes allocation decisions by POSTing **relative weights** to an authenticated endpoint using a per-council **API key**. The platform normalizes those weights to the bot's current on-chain voting power and submits the ballot on-chain. Scoring and ranking logic live entirely in the caller; the platform ingests the weights and handles the on-chain mechanics.

**When to use it:** when you want part of the council's allocation to follow an objective, automatable signal, for example onchain activity metrics, contribution data from a dashboard, or any policy you can express as a ranked list of recipients.

**Setup**

1. On the **Membership** page, click **New group** and select **Metrics** as the eligibility method.
2. Set the **Vote power** (the total number of votes the bot can spread across recipients). This is the share of the council's allocation controlled by the automated policy.
3. Click **Create**. One wallet transaction adds the bot as a voter with that voting power.
4. Open the group detail page. In the **Metrics API** panel, enter a label and click **Create key**. Copy the token immediately. It is shown **once** and not stored in plaintext.

**Key management**

The Metrics API panel lists all keys for the council, identified by label and a short prefix. Keys show their last-used date. To deactivate automated voting, click **Revoke** next to any key. Revoked keys are rejected immediately and cannot be reinstated. Mint a new key to resume.

**Editing vote power**

To change the share of the allocation the bot controls, open the group detail, click the edit icon, update **Vote power**, and click **Save**. Changing vote power submits an on-chain transaction.

**Constraints**

- A council may have **at most one** metrics group.
- The eligibility method of a metrics group is locked after creation.
- The bot needs no role beyond being a voter; no role grant is required during setup.

For the request format and response codes, see [Metrics API](../../../developers/005-metrics-api.md) in the developer docs.

:::tip[Single membership]
An address belongs to **one** group per council. Adding an address that already votes in another group of the same council is skipped rather than duplicated.
:::
