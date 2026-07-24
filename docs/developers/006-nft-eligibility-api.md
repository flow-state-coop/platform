---
slug: /developers/nft-eligibility-api
description: Endpoints behind NFT Holder voter groups, eligibility checks, and vote claims
---

# NFT Eligibility API

These endpoints power [NFT Holder voter groups](../platform/flow-councils/operators/004-membership.md#nft-holder-groups): the admin-side collection probe, the read-only eligibility check a voter's popup runs, and the claim that assigns votes on-chain.

Three routes, deliberately separated by what they cost:

| Route | Auth | Cost |
|---|---|---|
| `POST /api/flow-council/voter-groups/nft-probe` | Council manager | RPC reads |
| `POST /api/flow-council/eligibility/nft-status` | None | RPC reads, no writes |
| `POST /api/flow-council/eligibility/nft-claim` | Wallet signature | One on-chain transaction, paid by Flow State |

:::info
Councils gated by [GoodDollar](../platform/flow-councils/operators/004-membership.md#gooddollar-groups-celo-only) are unaffected by everything on this page. A council uses one automated method or the other, and the GoodDollar endpoint (`/api/flow-council/eligibility`) is untouched by these routes.
:::

## Probe a collection

Detects whether an address is an ERC-721 or ERC-1155 collection, so the admin UI can show what it found before the group is saved. Requires a signed-in wallet holding a manager role on the council, because it is otherwise an unauthenticated RPC amplifier.

```
POST /api/flow-council/voter-groups/nft-probe
Content-Type: application/json
```

```json
{
  "chainId": 11155420,
  "councilId": "0xe2e...",
  "contractAddress": "0x9a2...",
  "overrideStandard": "erc721"
}
```

`overrideStandard` is optional. Send it only when detection was inconclusive and an admin picked a standard by hand.

Response:

```json
{
  "success": true,
  "status": "detected",
  "standard": "erc721",
  "collectionName": "Flowstaters Core NFT",
  "message": "ERC-721 collection detected"
}
```

`message` is the exact admin-facing string for the status, so the API and the UI cannot drift.

| `status` | Meaning | Manual override allowed |
|---|---|---|
| `detected` | The contract advertises ERC-721 or ERC-1155. `standard` and, when readable, `collectionName` are returned. | n/a |
| `no_contract` | No contract at that address on this chain. | No |
| `no_erc165` | The contract doesn't advertise a standard we can read. | Yes |
| `unsupported_interface` | The contract advertises neither ERC-721 nor ERC-1155. | Yes |
| `unreliable_erc165` | The contract's self-description is unreliable (it claims to support every interface). | No |
| `read_failed` | The chain read didn't complete. Says nothing about the contract. | No |

When `overrideStandard` is sent, the response also carries `overrideOk` (boolean) and, on failure, `overrideReason` with the matching `message`:

- `looks_like_token`: the contract answers ERC-20 calls. Rejected, because accepting it would grant votes to every token holder.
- `missing_interface`: the contract doesn't expose the functions the chosen standard requires.
- `read_failed`: the verification reads didn't complete. Retry rather than change anything.

The same detection and override verification run again server-side when the group is written, so a probe response is feedback, never trust.

## Check a wallet's eligibility

Read-only. No writes, no transaction, no rate limit. This is what the eligibility popup calls when it opens.

```
POST /api/flow-council/eligibility/nft-status
Content-Type: application/json
```

```json
{ "chainId": 11155420, "councilId": "0xe2e...", "address": "0xf39..." }
```

Response:

```json
{
  "success": true,
  "votingPower": "0",
  "botHasRole": true,
  "requirements": [
    { "groupId": 13, "name": "Flowstaters Core NFT", "votes": 20, "status": "unmet" },
    { "groupId": 14, "name": "Flowstaters Community NFT", "votes": 5, "status": "met" }
  ]
}
```

- **`votingPower`**: the wallet's current on-chain voting power in this council, as a string. Anything above `"0"` means there is nothing to claim.
- **`botHasRole`**: whether the Flow State bot holds `VOTER_MANAGER_ROLE` on the council. `false` means claiming is unavailable council-wide until an admin grants it.
- **`status`**: `met`, `unmet`, or `unknown`. `unknown` means that requirement's chain read failed and must never be rendered as "you don't qualify".

Requirement metadata for a wallet-free render (labels, allocations, acquisition links) comes from the [public voter-groups endpoint](004-public-api.md#voter-groups) instead, which needs no address and no RPC.

## Claim votes

Adds the wallet to the highest-allocation group it qualifies for and assigns its votes on-chain. Every successful claim is a transaction paid by the Flow State bot wallet, which is why a signature and a throttle guard it.

```
POST /api/flow-council/eligibility/nft-claim
Content-Type: application/json
```

```json
{
  "address": "0xf39...",
  "chainId": 11155420,
  "councilId": "0xe2e...",
  "signature": "0x...",
  "issuedAt": 1784645520000
}
```

`issuedAt` is a Unix timestamp in **milliseconds**, and must be the same instant that was signed.

Success:

```json
{ "success": true, "votingPower": 20, "groupId": 13, "groupName": "Flowstaters Core NFT" }
```

The granted amount is the **largest single allocation** the wallet qualifies for, never the sum, and the wallet lands in exactly one group. Ties break toward the group with the lowest id (the one created first). Clients should render votes from this response rather than waiting for the subgraph, which lags the transaction by up to 30 seconds.

### The signed message

Client and server build the message from the same function, so it must match byte for byte:

```
Claim voting rights in this Flow Council.

Council: 0xe2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0
Chain: 11155420
Wallet: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
Issued at: 2026-07-21T14:32:00Z
```

- Addresses render **in full and lowercased**. A signed message has to be verifiable from its own text.
- The timestamp is ISO 8601 UTC truncated to the second, derived from `issuedAt`.
- A signature is valid for **5 minutes**, with **30 seconds** of tolerance for a client clock running ahead.
- It is **not a sign-in**: it creates no session and grants nothing by itself, it only proves the wallet consents to this claim.

EOA signatures are verified locally with ECDSA. Contract accounts (Safe and similar) are verified on-chain through ERC-1271 / ERC-6492, so smart-contract wallets can claim.

### Refusals

Refusals return HTTP `200` with `"success": false` and a `code`, except `rate_limited` which returns `429`. Each code is distinct so a voter can be told exactly what happened.

| `code` | Meaning |
|---|---|
| `already_voter` | The wallet already has voting power. Returned with `"success": true` and the current `votingPower`; nothing is written and no transaction is sent. |
| `not_eligible` | No requirement was met. |
| `check_unavailable` | At least one requirement couldn't be read, so a "not eligible" verdict would be a guess. |
| `rate_limited` | Another claim on this council took the window. Transient; retry shortly. |
| `bot_missing_role` | The Flow State bot doesn't hold `VOTER_MANAGER_ROLE` on the council. An admin has to grant it. |
| `invalid_signature` | The signature doesn't verify for the claiming address. |
| `expired_signature` | `issuedAt` is older than 5 minutes or too far in the future. |
| `chain_error` | The on-chain assignment failed. Nothing partial is left behind and the claim can be retried. |
| `no_requirements` | The council has no NFT Holder groups configured. |
| `council_unverified` | The council address wasn't deployed by the Flow Council factory, so the bot won't spend gas on it. |

### Rate limit

At most **one claim per council per 3 seconds**. The window protects the bot wallet's nonce and gas; it is short on purpose, so a launch-day rush of holders isn't serialized into an hour of waiting. It is never a permanent refusal.

## Configuring a group

NFT groups are created and edited through the manager-gated voter-groups endpoint. The collection config travels as a single `nftConfig` object:

```
POST /api/flow-council/voter-groups
PATCH /api/flow-council/voter-groups?id={groupId}
```

```json
{
  "chainId": 11155420,
  "councilId": "0xe2e...",
  "name": "Flowstaters Core NFT",
  "eligibilityMethod": "nft",
  "defaultVotingPower": 20,
  "nftConfig": {
    "contractAddress": "0x9a2...",
    "tokenStandard": "erc721",
    "acquisitionUrl": "https://example.org/core-nft",
    "collectionName": "Flowstaters Core NFT"
  }
}
```

- **`tokenStandard`**: `"erc721"` or `"erc1155"`. An `erc1155` config **requires** `tokenId`; an `erc721` config must not carry one.
- **`tokenId`**: a canonical decimal string (no leading zeros) that fits in a `uint256`.
- **`acquisitionUrl`**: optional, `http:` or `https:` only, up to 2048 characters. Shown to voters who don't hold the NFT.
- **`collectionName`**: optional cached label from detection, up to 100 characters. The group's `name` is admin-owned and is never overwritten by a re-probe.
- `contractAddress` is stored lowercased and re-probed on write, so a standard that contradicts the chain is rejected.

On `PATCH`, `nftConfig` moves as a **whole object or not at all**. Omitting it leaves the stored config untouched (a rename doesn't need to resend it), and a partial field update is rejected rather than merged, which is what stops an ERC-721 to ERC-1155 switch from landing a config matching nobody.

| Status | When |
|---|---|
| `400` | A GoodDollar group exists on the council ("This council uses GoodDollar eligibility. A council uses one automated method or the other."), or the mirrored case when creating a GoodDollar group on an NFT council. |
| `400` | Switching a group's method to or from `nft` while it has members. |
| `400` | Detection contradicts the submitted standard, or a manual override fails verification. |
| `409` | The council already has an NFT group for that collection and token ID. |

Because ERC-721 groups have no token ID to distinguish them, this means **one group per ERC-721 collection per council**. Tiering happens across distinct collections, or across token IDs within one ERC-1155.

:::note[Bot wallet spend]
NFT claims extend the Flow State bot's on-chain spending from Celo alone to **Arbitrum, Base, Optimism, and OP Sepolia**. Funding and low-balance monitoring for those chains already exist; this is informational, not a setup step.
:::
