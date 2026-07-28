---
slug: /developers/splitter-api
description: Authenticated API for programmatically updating a Flow Splitter's share register
---

# Flow Splitter API

The **Flow Splitter API** lets an external system read a pool's recipients and shares, and replace them, with no human signing anything. The Flow State bot signs the transactions on the pool's behalf. Scoring, ranking, and scheduling are entirely the caller's responsibility; the platform ingests relative weights and handles the on-chain work.

:::info
Every endpoint requires a **Bearer API key** scoped to a single pool. Keys are minted and revoked by a pool admin from the pool's admin page (see [Flow Splitter Admin](../platform/flow-splitters/004-admin.md)). The token is shown once on creation; store it securely.
:::

:::warning
For writes to work, the Flow State bot must hold **admin** on the pool. That is the same permission a human admin holds: the Flow Splitter contract has no narrower role, so the bot can also change pool settings and add or remove admins, including you. Grant it from the pool's admin page.
:::

## Read the current allocation

```
GET /api/flow-splitter/allocation
Authorization: Bearer <key>
```

The pool is derived from the key, so there is no pool parameter and a key cannot be aimed at a pool it does not own.

```json
{
  "success": true,
  "pool": {
    "chainId": 8453,
    "poolId": "32",
    "address": "0x…",
    "name": "My Splitter",
    "symbol": "MYS",
    "token": "0x…"
  },
  "totalUnits": "1000000",
  "targetTotalUnits": "1000000",
  "recipients": [
    { "address": "0xabc…", "units": "750000", "percentage": 75 },
    { "address": "0xdef…", "units": "250000", "percentage": 25 }
  ]
}
```

The recipient list is assembled from the indexer merged with the register the platform last wrote, and then every address in that set is verified on-chain. The merge matters: the indexer alone can miss a recipient the platform added moments earlier, and verifying units on-chain catches wrong numbers but cannot surface an address it was never told about.

Reads are not rate limited.

## Write an allocation

```
POST /api/flow-splitter/allocation
Authorization: Bearer <key>
Content-Type: application/json
```

```json
{
  "recipients": [
    { "address": "0xabc…", "weight": 3.5 },
    { "address": "0xdef…", "weight": 1.0 }
  ]
}
```

- **`recipients`**: 1 to 1000 entries. Order is not significant.
- **`address`**: a valid EVM address. Duplicates and the zero address are rejected.
- **`weight`**: a finite, non-negative number representing this recipient's share relative to the others. Weights are arbitrary (scores, revenue, points) and do not have to sum to anything. At least one must be positive.

### The list is the complete register

**Any current recipient missing from the list is set to zero shares and stops receiving flow.** Addresses not currently in the pool are added. This is a full replacement, not a patch, which is also what makes retries safe: re-sending the same payload converges rather than compounding.

### Normalization

Weights are normalized to a total of at most **1,000,000** shares, so each recipient's share reads as parts per million. Allocation uses largest-remainder (Hamilton) apportionment:

1. Entries with zero weight are dropped.
2. Each entry receives a floor allocation proportional to its weight. Leftover units go to the largest fractional remainders, **except when entries are tied for the last unit**, in which case the tied unit is dropped rather than handed to whichever address sorts first.
3. Recipients that round to zero end up with zero shares.

Because tied leftover units are dropped, the total lands **at or just under 1,000,000, never over**. An even three-way split gives 333,333 each, totalling 999,999. The first API write moves the pool to this total regardless of what it was before.

### Writes are asynchronous

A large register can take several transactions and a couple of minutes, so the API validates the payload, accepts it, and returns a job id immediately.

```json
{
  "success": true,
  "status": "queued",
  "jobId": "3f2a…",
  "payloadHash": "9c1b…",
  "changed": 12,
  "batches": 1
}
```

Only the recipients whose shares actually change are written, in batches of 50 changes per transaction. **A large payload where little moved is one transaction, not many.** Note that shares are relative, so how much moves depends on the size of the change rather than on how many weights you edited: a small change to a few weights typically moves only those, but a change large enough to shift the proportions re-writes everyone.

If the computed register already matches what is on-chain, the job completes without sending any transaction:

```json
{ "success": true, "status": "no_change", "txHashes": [], "recipients": 2 }
```

This is verified against the chain, not the indexer.

## Poll a job

```
GET /api/flow-splitter/jobs/{jobId}
Authorization: Bearer <key>
```

```json
{
  "success": true,
  "job": {
    "id": "3f2a…",
    "status": "running",
    "payloadHash": "9c1b…",
    "batchesCompleted": 2,
    "txHashes": ["0x…", "0x…"],
    "error": null,
    "createdAt": "2026-07-28T21:00:00.000Z"
  }
}
```

`status` is one of `queued`, `running`, `succeeded`, `failed`, or `no_change`. A key can only see jobs for its own pool. Jobs stay pollable for **seven days**, after which the endpoint returns `404`.

Polling is also the recovery mechanism: a poll that finds a stalled job restarts it, resuming from where it stopped rather than starting over.

### Recovering a lost job id

If a write is rejected because a job is already running, the rejection carries that job's id and payload fingerprint, so a caller that lost the original response can still poll it and can tell its own submission from another system's:

```json
{
  "success": false,
  "error": "A write is already running for this pool, please retry once it finishes",
  "jobId": "3f2a…",
  "payloadHash": "9c1b…"
}
```

### Partial writes

If some batches land and one fails, the register is left mid-update: shares no longer sum to the target total, so every recipient's percentage and live stream rate is wrong until it is repaired. The job reports itself `failed`, names the transactions that landed, and says the register is inconsistent.

**Re-submitting the same payload repairs it.** The platform recomputes what still needs changing rather than replaying the original batches, so the repair sends fewer transactions than the first attempt.

## Responses

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ "success": true, … }` | Read succeeded, or a write that changed nothing (`status: "no_change"`). |
| `202` | `{ "success": true, "status": "queued", "jobId": "…" }` | Write accepted. Poll the job for progress. |
| `400` | `{ "error": "…" }` | Invalid body, invalid or duplicate address, or all weights zero. **Cools the key down.** |
| `401` | `{ "error": "Unauthorized" }` | Missing, unknown, or revoked key. |
| `404` | `{ "error": "Job not found" }` | Unknown job, a job belonging to another pool, or one past its seven-day expiry. |
| `409` | `{ "error": "A write is already running for this pool…", "jobId": "…" }` | Another job is in flight for this pool. |
| `409` | `{ "error": "The Flow State bot is not an admin of this pool…" }` | The bot's admin grant is missing or was withdrawn. Existing keys are left in place, so re-granting resumes the integration without minting a new key. |
| `409` | `{ "error": "This pool has no admins and is permanently immutable…" }` | The pool was set to "No Admin" and can never be API-driven. |
| `409` | `{ "error": "The API does not support pools with transferable units…" }` | Recipients can move units between writes, so the register cannot be owned by the API. |
| `413` | `{ "error": "…" }` | Request body exceeds 256 KB. |
| `429` | `{ "error": "Writes to this pool are rate limited, please retry later" }` | Pool-level rate limit, measured from the previous job's completion. |
| `429` | `{ "error": "This API key is cooling down…" }` | Key-level cooldown after a deterministically bad payload. |
| `502` | `{ "error": "There was an error, please try again later" }` | RPC or chain error. The message is generic; provider details are never exposed. |

The three rejection messages a caller is most likely to hit are worded distinctly on purpose, so you can tell a **running job** from a **key cooldown** from the **active-key cap**.

## Limits

- **One job in flight per pool.** A job whose runner died stops reporting and releases its slot, so a crash cannot wedge a pool.
- **A 60-second minimum interval between writes**, measured from the previous job's completion. For a large register the job itself takes longer than the interval, so the in-flight rule is the real limit.
- **A 60-second key cooldown** after a payload that is deterministically wrong. Failures that are the platform's fault (RPC down, chain congestion) never trigger it, so a healthy integration is never penalized for our outage.
- **10 active keys per pool.** Revoking one frees a slot.
- **1000 recipients and 256 KB per payload.**

## Authentication

**API key format:** `splitter_<base64url-encoded random bytes>`

Keys are:

- Scoped to a **single pool**. A key belongs to exactly one pool and cannot be pointed at another.
- Not stored in plaintext. Only a keyed hash is persisted, and the token is shown once on creation.
- Soft-revoked: a revoked key is rejected as missing, and revocation takes effect immediately. It does **not** cancel a job that was already accepted.

```
Authorization: Bearer splitter_abc123...
```

## Limitations

- **Multiple writers can overwrite each other.** With up to 10 keys per pool, two systems can both write. If one times out and retries, the other's write can land in between and be replaced. Nothing detects this; the write history in the admin UI makes it diagnosable after the fact. Coordinating writers is the pool owner's responsibility.
- **Manual edits are not blocked.** A pool admin can still edit shares by hand, and the next API write will overwrite those changes. The admin page shows a notice to that effect when a pool has active keys.
- **A recipient added by hand inside the indexer's lag window can be missed.** If a human adds a brand new recipient and an API write happens before the indexer catches up, that recipient is in neither source and keeps their shares, so the pool's total exceeds 1,000,000 and every percentage is slightly off until the next write picks them up. Superfluid provides no way to enumerate a pool's members on-chain, so this window is inherent.

## Example

```bash
# Read the current register
curl https://flowstate.network/api/flow-splitter/allocation \
  -H "Authorization: Bearer splitter_abc123..."

# Replace it
JOB=$(curl -s -X POST https://flowstate.network/api/flow-splitter/allocation \
  -H "Authorization: Bearer splitter_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [
      { "address": "0xabc...", "weight": 5 },
      { "address": "0xdef...", "weight": 3 }
    ]
  }' | jq -r .jobId)

# Poll until it settles
curl "https://flowstate.network/api/flow-splitter/jobs/$JOB" \
  -H "Authorization: Bearer splitter_abc123..."
```
