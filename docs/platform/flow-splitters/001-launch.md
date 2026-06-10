---
slug: /flow-splitters/launch
description: How to configure and deploy Flow Splitters.
---

# Launch

Creating a Flow Splitter requires a wallet, a little ETH, and no code. Navigate to [https://flowstate.network/flow-splitters/launch](https://flowstate.network/flow-splitters/launch) to get started.

## Metadata
Flow Splitter Shares are ERC20 tokens (with distribution superpowers). You can give your Shares a name and token symbol to identify or brand them across wallets and block explorers. If your Flow Splitter will be used for any external purposes (e.g. attracting funding for your team), you’re highly encouraged to use these fields.

:::tip[Shares aren't Super Tokens] 
These Share tokens are distinct from those you will distribute through the Flow Splitter. Think of Shares as the “stock” of the Flow Splitter and the Super Token as the “dividend” currency.
:::

## Core Configuration

Flow Splitters are tied to a single distribution [Super Token](https://docs.superfluid.finance/docs/concepts/overview/super-tokens) at deployment (future enhancements may unlock multiple token support).

You can select one of several popular Super Token options on your chain of choice or \`Custom\` and then paste [any valid Super Token](https://explorer.superfluid.finance/base-mainnet/supertokens) contract address into the field.

You must also determine whether you want your Flow Splitter shares transferable. Admins will maintain the ability to edit the share registry regardless of transferability. Transferability may open interesting opportunities for your Flow Splitter (making shares akin to tradable equity) or be inappropriate for your use case.

## Contract Admin

The Flow Splitter system includes a single-level access control list smart contract module. Future versions will offer finer-grained control levels. For now, add one or more addresses (your connected wallet is added by default) that should have full control of the Flow Splitter. Multisig addresses (e.g. Safes) are supported.

Admins can remove/add other admins and alter the share registry.

You can set your Flow Splitter to \`No Admin\` anytime, but once Admin control is renounced there’s no going back.

## Share Register

The Share Register represents the current [allocation weights](https://docs.superfluid.finance/docs/protocol/distributions/guides/pools#about-member-units) of your Flow Splitter.

Every distribution (streaming or instant) sent to the Splitter is allocated based on the number of shares each address owns. When a share update is processed, active streaming distributions will automatically adjust their ongoing allocation.

Shares can only be whole numbers. If you want decimal percentage precision in your split, just enter the digits without decimals (a 99.99%/.01% split can be entered as 9999 & 1 shares).

The CSV upload features make mass updates simple. Make sure you’ve provided valid Ethereum addresses (no ENSs yet) and whole share values in each line of your spreadsheet. If you have an invalid input, you won’t be able to launch the Flow Splitter until you fix it.