---
slug: /developers/public-api
description: Unauthenticated REST endpoints for building on Flow State data
---

# Public API

The platform exposes a small set of **unauthenticated** REST endpoints under `/api/flow-council`. They require no [Sign-In with Ethereum](003-architecture.md) session, API key, or wallet — issue a plain HTTP request and parse the JSON. They are read-only views over Flow Council data, designed for dashboards and other external integrations.

:::info
Every endpoint on this page is genuinely public. The rest of `/api/flow-council` (group management, application review, voter membership writes) is gated behind a SIWE session and on-chain role checks, and is not documented here.
:::

All examples use the canonical base URL `https://flowstate.network`. Two query parameters recur across these endpoints:

- **`chainId`** — the numeric chain ID the council is deployed on. It must be one of the platform's supported networks; an unsupported value returns a `400`.
- **`councilId`** — the council (Flow Council) contract address. It must be a valid EVM address.

A `councilId` that is valid but unknown to the platform database is **not** an error — these endpoints return an empty result for it rather than a `404`.

## Voter groups

Returns the voter group membership lists for a council. Unauthenticated. ISR-cached for 60 seconds.

```
GET /api/flow-council/voter-groups/public?chainId={chainId}&councilId={address}
```

Response:

```json
{
  "groups": [
    {
      "groupId": 12,
      "name": "Core Contributors",
      "eligibilityMethod": "manual",
      "defaultVotingPower": 10,
      "members": ["0xabc...", "0xdef..."]
    },
    {
      "groupId": 13,
      "name": "Flowstaters Core NFT",
      "eligibilityMethod": "nft",
      "defaultVotingPower": 20,
      "members": ["0x123..."],
      "nftContractAddress": "0x9a2...",
      "nftTokenStandard": "erc721",
      "nftTokenId": null,
      "nftAcquisitionUrl": "https://example.org/core-nft",
      "nftCollectionName": "Flowstaters Core NFT"
    }
  ]
}
```

- `eligibilityMethod` is one of `"manual"`, `"gooddollar"`, `"metrics"`, or `"nft"`.
- `defaultVotingPower` is the allocation a voter receives when first added through the group.
- The five `nft*` fields are present **only** on `"nft"` groups. `nftTokenId` is `null` for ERC-721 collections. They describe the requirement the [NFT Eligibility API](006-nft-eligibility-api.md) evaluates.
- Add **`&includeMembers=0`** to omit the `members` arrays. On a council with thousands of voters that is the bulk of the payload, and the eligibility popup uses this variant because it only needs group metadata.
- An unknown `councilId` (not in the platform DB) returns `{ "groups": [] }`.
- Per-voter allocations and cast-vote counts are not included; compute these from existing subgraph data combined with the membership lists.

This endpoint is consumed by the [GoodBuilders dashboard](https://github.com/flow-state-coop/goodbuilders-dashboard).

## Public applications

Returns the publicly visible applications for a council — those that have reached a terminal review state (`ACCEPTED`, `GRADUATED`, or `REMOVED`). Pending and draft applications are never exposed. Unauthenticated. Computed per-request (`dynamic = "force-dynamic"`, not cached).

```
GET /api/flow-council/applications/public?chainId={chainId}&councilId={address}
```

Response:

```json
{
  "success": true,
  "applications": [
    {
      "project_id": 42,
      "project_name": "Acme Protocol",
      "application_status": "Accepted",
      "status": "ACCEPTED",
      "project_description": "...",
      "logo": "https://...",
      "banner": "https://...",
      "funding_address": "0xabc...",
      "website": "https://acme.xyz",
      "demo_link": "https://...",
      "x_handle": "acme",
      "farcaster_handle": "acme",
      "telegram_group": "...",
      "discord_channel": "...",
      "karma_gap_link": "...",
      "gardens_link": "...",
      "github_repos": "https://github.com/acme/a|https://github.com/acme/b",
      "project_addresses": "0x111...|0x222...",
      "goodcollective_pool_addresses": "0x333..."
    }
  ]
}
```

- `status` is the raw enum value (`ACCEPTED` / `GRADUATED` / `REMOVED`); `application_status` is its human-readable label.
- `github_repos`, `project_addresses`, and `goodcollective_pool_addresses` are pipe-delimited (`|`) strings, not arrays — split on `|` to enumerate them.
- An unknown `councilId` returns `{ "success": true, "applications": [] }`.

## Round feed

Returns the public message feed for a council's round, including the message authors' display names, affiliations, linked project metadata, and reaction counts. Unauthenticated. Computed per-request (`dynamic = "force-dynamic"`, not cached).

```
GET /api/flow-council/round-feed?chainId={chainId}&councilId={address}&address={viewer}
```

The optional **`address`** parameter is a viewer address: when supplied, the `reactions` payload marks which messages that address has already reacted to. Omit it for an anonymous view.

Response:

```json
{
  "success": true,
  "messages": [
    {
      "id": 1,
      "channelType": "PUBLIC_ROUND",
      "authorAddress": "0xabc...",
      "content": "gm",
      "messageType": "TEXT",
      "projectId": 42,
      "pinnedAt": null,
      "pinnedBy": null,
      "createdAt": "2026-06-01T12:00:00.000Z",
      "updatedAt": "2026-06-01T12:00:00.000Z"
    }
  ],
  "affiliations": { "0xabc...": "..." },
  "projectMetadata": { "42": { "name": "Acme Protocol", "logoUrl": "https://..." } },
  "displayNames": { "0xabc...": "acme.eth" },
  "reactions": { "1": { "👍": 3 } }
}
```

- Only messages in the `PUBLIC_ROUND` channel are returned, ordered oldest-first.
- `projectMetadata` is keyed by project ID and only contains projects that messages reference.
- An unknown or missing `councilId` returns a `{ "success": false, "error": "..." }` body.

## Display name profiles

Resolves a batch of EVM addresses to their display names (ENS and platform profile names). Unauthenticated.

:::note
This endpoint is a **POST**, not a GET — the address list travels in the request body so a full page of checksummed addresses doesn't blow past the URL-length limits some CDNs and proxies enforce.
:::

```
POST /api/flow-council/voter-groups/profiles
Content-Type: application/json

{ "addresses": ["0xabc...", "0xdef..."] }
```

Response:

```json
{
  "success": true,
  "names": {
    "0xabc...": "acme.eth",
    "0xdef...": "..."
  }
}
```

- At most **500** addresses per request; more returns a `400`.
- An empty `addresses` array returns `{ "success": true, "names": {} }`.
- Every entry must be a valid EVM address, otherwise the request returns a `400`.
