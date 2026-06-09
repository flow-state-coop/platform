# Flow State Platform

### Getting Started

Start by setting up the local environment variables

```
cp .env.sample .env
```

#### Install Dependencies

```
pnpm install
```

#### Run

To run locally

```
pnpm dev
```

### Public APIs

#### Flow Council voter groups

Returns the voter group membership lists for a council. Unauthenticated. ISR-cached for 60 seconds.

```
GET /api/flow-council/voter-groups/public?chainId={chainId}&councilId={address}
```

Response:

```json
{
  "groups": [
    {
      "name": "Core Contributors",
      "eligibilityMethod": "manual",
      "members": ["0xabc...", "0xdef..."]
    },
    {
      "name": "GoodDollar Holders",
      "eligibilityMethod": "gooddollar",
      "members": ["0x123..."]
    }
  ]
}
```

- `eligibilityMethod` is `"manual"` or `"gooddollar"` at launch.
- An unknown `councilId` (not in the platform DB) returns `{ "groups": [] }`.
- Per-voter allocations and cast-vote counts are not included; compute these from existing subgraph data combined with the membership lists.

This endpoint is consumed by the [GoodBuilders dashboard](https://github.com/flow-state-coop/goodbuilders-dashboard).
