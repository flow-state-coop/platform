---
slug: /developers/contracts
description: The onchain contracts behind Flow Splitters and Flow Councils
---

# Contracts

Flow State's two onchain products — **Flow Splitters** and **Flow Councils** — both settle funds through [Superfluid distribution pools (GDA)](https://docs.superfluid.finance/docs/concepts/overview/distributions). The platform reads and writes these contracts through the ABIs bundled in `src/lib/abi/`. This page is an orientation map; for the full Flow Splitter interface see the generated [IFlowSplitter](IFlowSplitter.md) reference.

## Bundled ABIs

The ABIs the app links against live in **`src/lib/abi/`**:

| File | Exported ABI | Used for |
|---|---|---|
| `flowSplitter.ts` | `flowSplitterAbi` | The Flow Splitter contract |
| `flowCouncil.ts` | `flowCouncilAbi` | The Flow Council contract |
| `flowCouncilFactory.ts` | `flowCouncilFactoryAbi` | Deploying new Flow Councils |
| `superAppSplitter.ts` | `superAppSplitterAbi` | Super App splitter variant |
| `superAppSplitterFactory.ts` | `superAppSplitterFactoryAbi` | Deploying Super App splitters |
| `erc721.ts` | `erc721Abi` | NFT reads (gating, ownership) |

## Flow Splitter

The **Flow Splitter** creates a Superfluid distribution pool and assigns proportional units to its members, then streams or distributes a Super Token to them according to those units. Pool creation, member units, admins, and the `metadata` string are all set through the contract.

- **Interface reference:** [IFlowSplitter](IFlowSplitter.md)
- **Source repository:** [github.com/flow-state-coop/flow-splitter](https://github.com/flow-state-coop/flow-splitter)

The `metadata` string is where the platform stores a Splitter's listing visibility (the `{"listed":true}` / `{"listed":false}` flag); see [Architecture](003-architecture.md) for how that round/pool metadata is consumed.

## Flow Council

A **Flow Council** is an access-controlled contract: a set of voters allocate voting power across recipients, and the resulting weights drive a Superfluid distribution pool. Permissions are gated by three OpenZeppelin-style role hashes, defined in `src/app/flow-councils/lib/constants.ts`:

| Role constant | Hash | Product name | Gates |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x0000…0000` | Super Admin | Full administration, including granting/revoking the other roles |
| `VOTER_MANAGER_ROLE` | `0xe39c…8248` | Voter Review | Adding, removing, and updating voters (membership management) |
| `RECIPIENT_MANAGER_ROLE` | `0xe555…1c2e` | Recipient Review | Managing the recipients eligible to receive flow |

These roles gate the membership and recipient-management actions exposed in the council UI. For example, the GoodDollar self-claim flow works by granting `VOTER_MANAGER_ROLE` to a Flow State-operated bot address, which then adds verified voters on the council's behalf.

:::info
`DEFAULT_ADMIN_ROLE` is the zero hash, the standard OpenZeppelin AccessControl admin role. Holding it lets an account grant and revoke both `VOTER_MANAGER_ROLE` and `RECIPIENT_MANAGER_ROLE`.
:::

## Superfluid GDA

Both products distribute funds through Superfluid's **General Distribution Agreement (GDA)** — the "distribution pool" primitive. Members hold units in a pool, and a Super Token is distributed (instantly or as a continuous stream) in proportion to those units. The platform does not reimplement this logic; it composes the existing Superfluid pools.

For the underlying mechanics, see the Superfluid docs on [distribution pools (GDA)](https://docs.superfluid.finance/docs/concepts/overview/distributions).
