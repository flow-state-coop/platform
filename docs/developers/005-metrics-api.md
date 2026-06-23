---
slug: /developers/metrics-api
description: Authenticated API for pushing automated ballots to a metrics voter group
---

# Metrics API

The **metrics ballot endpoint** lets an external caller push allocation decisions to a Flow Council's [metrics voter group](../platform/flow-councils/operators/004-membership.md#metrics-groups). The platform normalizes the submitted relative weights to the bot's current on-chain voting power and submits the ballot on-chain. Scoring and ranking logic are entirely the caller's responsibility; the platform ingests weights and handles the on-chain transaction.

:::info
This endpoint requires a **Bearer API key** scoped to the council. Keys are minted and revoked by a council manager from the Membership page (see [Council Membership](../platform/flow-councils/operators/004-membership.md#metrics-groups) for setup instructions). The key is shown once on creation; store it securely.
:::

## Submit a ballot

```
POST /api/flow-council/metrics/ballot
Authorization: Bearer <key>
Content-Type: application/json
```

### Request body

```json
{
  "votes": [
    { "recipient": "0xabc...", "weight": 3.5 },
    { "recipient": "0xdef...", "weight": 1.0 }
  ]
}
```

- **`votes`**: array of 1 to 1000 entries. Order is not significant.
- **`recipient`**: a valid EVM address that is a **current council recipient**. An address that is not a recipient returns a `400`.
- **`weight`**: a finite, non-negative number representing the recipient's share relative to the others. At least one entry must have a positive weight.

The caller never needs to know the council's voting power or spread configuration. The server reads those values on-chain per request and normalizes accordingly.

### Normalization

The server converts the relative weights to an integer ballot whose amounts sum to exactly the bot's current on-chain voting power, using **largest-remainder (Hamilton) apportionment**:

1. Entries with zero or negative weight are dropped.
2. If the council has a **Max Voting Spread** configured and more recipients than that limit carry positive weight, only the top-weighted ones are kept (tie-broken by address).
3. Each kept entry receives a floor allocation proportional to its weight; leftover units go to the largest fractional remainders.
4. Recipients that round to zero are omitted from the final ballot.

### Responses

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ "success": true, "txHash": "0x…" }` | Ballot cast on-chain. |
| `200` | `{ "success": true, "skipped": true }` | Computed ballot matches the bot's current on-chain ballot, so no transaction is sent. |
| `400` | `{ "error": "…" }` | Invalid body, unknown or non-recipient address, metrics voting not enabled for the council, no allocatable votes after normalization, or the bot has no voting power. |
| `401` | `{ "error": "Unauthorized" }` | Missing, invalid, or revoked key. |
| `413` | `{ "error": "…" }` | Request body exceeds 256 KB. |
| `429` | `{ "error": "Too many ballots, please retry later" }` | Rate limit exceeded (see below). |
| `502` | `{ "error": "There was an error submitting the ballot" }` | RPC or contract error. The message is generic; provider details are never exposed. |

### Rate limit

At most one ballot that results in an on-chain transaction is accepted per council per **60 seconds**. Submissions that match the current on-chain ballot (returning `skipped: true`) do not consume the rate-limit window.

:::note
The 60-second minimum interval prevents nonce races and caps gas spend when a caller retries rapidly. If you receive a `429`, wait at least 60 seconds before retrying.
:::

## Authentication

**API key format:** `metrics_<base64url-encoded random bytes>`

Keys are:
- Scoped to a single council.
- Not stored in plaintext. Only a keyed hash is persisted. The token is shown once in the Metrics API panel on creation.
- Soft-revoked: a revoked key is rejected as missing. Revocation takes effect immediately.

Pass the key as a standard HTTP Bearer token:

```
Authorization: Bearer metrics_abc123...
```

## Example

```bash
curl -X POST https://flowstate.network/api/flow-council/metrics/ballot \
  -H "Authorization: Bearer metrics_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "votes": [
      { "recipient": "0xabc...", "weight": 5 },
      { "recipient": "0xdef...", "weight": 3 },
      { "recipient": "0x123...", "weight": 2 }
    ]
  }'
```

Success response:

```json
{ "success": true, "txHash": "0x..." }
```

Skip response (ballot unchanged):

```json
{ "success": true, "skipped": true }
```
