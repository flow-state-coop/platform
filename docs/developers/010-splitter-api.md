---
slug: /developers/splitter-api
description:
  Authenticated API for programmatically updating a Flow Splitter's share
  register
---

# Flow Splitter API

The **Flow Splitter API** lets an external system read a pool's recipients and
shares, and replace them, with no human signing anything. The Flow State bot
signs the transactions on the pool's behalf. Scoring, ranking, and scheduling
are entirely the caller's responsibility; the platform ingests relative weights
and handles the on-chain work.

:::info Every endpoint requires a **Bearer API key** scoped to a single pool.
Keys are minted and revoked by a pool admin from the API card on the pool's
admin page (see
[Flow Splitter Admin](../platform/flow-splitters/004-admin.md#api)). The token
is shown once on creation; store it securely. :::

:::warning For writes to work, the Flow State bot must hold **admin** on the
pool. That is the same permission a human admin holds: the Flow Splitter
contract has no narrower role, so the bot can also change pool settings and add
or remove admins, including you. Grant it from the pool's admin page in
[one transaction](../platform/flow-splitters/004-admin.md#grant-the-bot-admin).
:::

:::info Writes are unlocked per pool with a **one-time payment of 10 USDC**,
made by a pool admin from the same API card. Reads, key minting, and job polls
work without it, so an integration can be built and tested end to end before
anyone pays; a write on a locked pool returns `402`. OP Sepolia is not gated.
:::

## Read the current allocation

```
GET /api/flow-splitter/allocation
Authorization: Bearer <key>
```

The pool is derived from the key, so there is no pool parameter and a key cannot
be aimed at a pool it does not own.

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

`totalUnits` is what the pool currently holds; `targetTotalUnits` is the nominal
total a write normalizes to, and is a constant. The two are not expected to
match: rounding leaves a write [a few units short](#normalization), and a pool
the API has not written yet, or one left mid-update by a partial write, can hold
anything at all. Percentages are computed against `totalUnits`, so they are
meaningful in every case.

`percentage` is truncated to four decimal places, so a column of them can sum to
slightly less than 100: an even three-way split reads 33.3333 three times. Treat
`units` as the number of record; the percentage is there to be read.

The recipient list is assembled from the indexer merged with the register the
platform last wrote, and then every address in that set is verified on-chain.
The merge matters: the indexer alone can miss a recipient the platform added
moments earlier, and verifying units on-chain catches wrong numbers but cannot
surface an address it was never told about.

Reads count against the same **60 requests per minute per key** as everything
else, and a key cooling down after a bad payload is refused here too. Neither
limit is a write limit; those are separate and stricter.

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
- **`address`**: a valid EVM address. Duplicates, the zero address, this pool's
  own address, and any other Superfluid pool are rejected. A pool cannot hold
  shares in another pool, so splitters cannot be chained by naming one as a
  recipient of another.
- **`weight`**: a finite, non-negative number representing this recipient's
  share relative to the others. Weights are arbitrary (scores, revenue, points)
  and do not have to sum to anything. At least one must be positive.

### The list is the complete register

**Any current recipient missing from the list is set to zero shares and stops
receiving flow.** Addresses not currently in the pool are added. This is a full
replacement, not a patch, which is also what makes retries safe: re-sending the
same payload converges rather than compounding.

One caveat on completeness: current recipients are resolved from the indexer
plus everything the API itself has written. A recipient a pool admin adds
manually on-chain is invisible to a write that lands before the indexer has
caught up, typically well under a minute, so that one write reports success
without zeroing them; the next write repairs it. Avoid hand-editing the register
of an API-controlled pool for exactly this kind of reason.

### Normalization

Weights are normalized to a total of at most **1,000,000** shares, so each
recipient's share reads as parts per million. Allocation uses largest-remainder
(Hamilton) apportionment:

1. Entries with zero weight are dropped.
2. Each entry receives a floor allocation proportional to its weight. Leftover
   units go to the largest fractional remainders, **except when entries are tied
   for the last unit**, in which case the tied unit is dropped rather than
   handed to whichever address sorts first.
3. Recipients that round to zero end up with zero shares.

Because tied leftover units are dropped, the total lands **at or just under
1,000,000, never over**. An even three-way split gives 333,333 each, totalling
999,999. The first API write moves the pool to this total regardless of what it
was before. Flow is split in proportion to units held, so a total a few units
short changes nothing about how the stream divides; do not reconcile it against
`targetTotalUnits`.

A recipient carrying **less than one millionth of the total weight** rounds to
zero and receives nothing. The write is accepted either way, and nothing in the
response singles those recipients out, so a caller with a long tail of small
weights should check the register afterwards with
`GET /api/flow-splitter/allocation`.

### Writes are asynchronous

A large register can take several transactions and a couple of minutes, so the
API validates the payload, accepts it, and returns a job id immediately.

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

Only the recipients whose shares actually change are written, in batches of 50
changes per transaction. **A large payload where little moved is one
transaction, not many.** Note that shares are relative, so how much moves
depends on the size of the change rather than on how many weights you edited: a
small change to a few weights typically moves only those, but a change large
enough to shift the proportions re-writes everyone.

If the computed register already matches what is on-chain, the job completes
without sending any transaction:

```json
{ "success": true, "status": "no_change", "txHashes": [], "recipients": 2 }
```

This is verified against the chain, not the indexer. Resolving the register is
the expensive part and it ran either way, so a `no_change` response still
consumes the write interval below.

A matching register can still come back `202` with a job instead: if a previous
write died with its last transaction unconfirmed, the register might change the
moment that transaction mines, so the shortcut is refused and the job waits the
orphan out before confirming the register stands. The job behaves like any
other; poll it.

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

`status` is one of `queued`, `running`, `succeeded`, or `failed`. A write that
changed nothing creates a job only in the unconfirmed-transaction case above, so
`no_change` is only ever a write response, never a job status. A key can only
see jobs for its own pool. Jobs stay pollable for **seven days**, after which
the endpoint returns `404`.

Polling is also the recovery mechanism: a poll that finds a stalled job restarts
it, resuming from where it stopped rather than starting over. Infrastructure
failures on our side (an RPC or indexer outage, a receipt wait that timed out)
are retried this way too, up to five attempts, rather than failing the write; a
job pauses for about two minutes between attempts, so keep polling rather than
treating a quiet job as stuck.

Poll every **5 to 10 seconds**. A job takes at least a block to move, so
anything tighter learns nothing and spends the 60-per-minute key budget you also
need for the next write. This endpoint accepts a key that is cooling down, one
that has since been revoked, and one whose minting admin has since been removed,
so a job already accepted can always be followed to the end.

A resumed attempt waits out a transaction the previous one left unconfirmed
instead of sending that batch again, so a congested chain costs time rather than
duplicate transactions.

Poll rather than assume a `202` means the write is already underway. The first
run starts alongside the response, so an instance recycled in between leaves the
job queued until something picks it up, and that something is your next poll.

### Superseded jobs

Accepting a new write for a pool retires any earlier job that has not finished,
marking it `failed` with
`Superseded by a newer write to this pool. Its allocation is the one that stands`.
A poll on the old job returns that rather than hanging.

An older job is never resumed either, and that does not depend on the retirement
above: a job is refused the moment a later write exists for its pool, whatever
became of that write, and one already running stops at its next batch boundary.
Two jobs cannot drive the same pool toward different targets.

### Recovering a lost job id

If a write is rejected because a job is already running, the rejection carries
that job's id and payload fingerprint, so a caller that lost the original
response can still poll it and can tell its own submission from another
system's:

```json
{
  "success": false,
  "error": "A write is already running for this pool, please retry once it finishes",
  "jobId": "3f2a…",
  "payloadHash": "9c1b…"
}
```

### Partial writes

If some batches land and one fails, the register is left mid-update: shares no
longer sum to the target total, so every recipient's percentage and live stream
rate is wrong until it is repaired. The job reports itself `failed`, names the
transactions that landed, and says the register is inconsistent.

A job that gave up with a transaction still unconfirmed says so instead, because
that transaction can still mine after the job is over. It carries the same
repair instruction: the error distinguishes a register that changed, one that
might have, and one that was never touched.

**Re-submitting the same payload repairs it.** The platform recomputes what
still needs changing rather than replaying the original batches, so the repair
sends fewer transactions than the first attempt.

With one exception, which the error names: a payload **the chain rejected** is
rejected identically however many times it is sent, so that error asks for a
corrected allocation instead of the same one. Because writes are full
replacements, submitting the corrected allocation repairs the register in the
same pass.

A job can also stop on a condition the platform itself refuses, such as a pool
grown past the member count the API can enumerate. Those errors lead with the
condition rather than with repair advice, because nothing about the payload is
what has to change.

## Responses

| Status | Body                                                                         | Meaning                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | `{ "success": true, … }`                                                     | Read succeeded, or a write that changed nothing (`status: "no_change"`).                                                                                                                  |
| `202`  | `{ "success": true, "status": "queued", "jobId": "…" }`                      | Write accepted. Poll the job for progress.                                                                                                                                                |
| `400`  | `{ "error": "…" }`                                                           | Invalid or duplicate address, an address that is the pool itself or another Superfluid pool, or all weights zero. **Cools the key down.** Malformed JSON also returns `400` but does not. |
| `401`  | `{ "error": "Unauthorized" }`                                                | Missing, unknown, or revoked key.                                                                                                                                                         |
| `402`  | `{ "error": "This pool's API is locked…" }`                                  | The pool's one-time unlock has not been paid. A pool admin can pay it from the pool's admin page; nothing about the key or the payload is at fault, and no cooldown is triggered.         |
| `403`  | `{ "error": "The wallet that created this API key is no longer an admin…" }` | The key's creator lost pool admin, so the key lost the authority it was minted with. A current admin can mint a replacement.                                                              |
| `404`  | `{ "error": "Job not found" }`                                               | Unknown job, a job belonging to another pool, or one past its seven-day expiry.                                                                                                           |
| `404`  | `{ "error": "Pool not found" }`                                              | The key's pool is not in the indexer, which normally means the id was never deployed on that chain.                                                                                       |
| `409`  | `{ "error": "A write is already running for this pool…", "jobId": "…" }`     | Another job is in flight for this pool.                                                                                                                                                   |
| `409`  | `{ "error": "The Flow State bot is not an admin of this pool…" }`            | The bot's admin grant is missing or was withdrawn. Existing keys are left in place, so re-granting resumes the integration without minting a new key.                                     |
| `409`  | `{ "error": "This pool has no admins and is permanently immutable…" }`       | The pool was set to "No Admin" and can never be API-driven.                                                                                                                               |
| `409`  | `{ "error": "The API does not support pools with transferable units…" }`     | Recipients can move units between writes, so the register cannot be owned by the API.                                                                                                     |
| `409`  | `{ "error": "Pool … has more than 20000 members…" }`                         | The pool is larger than the API can enumerate, so it cannot describe or replace the register honestly. Nothing about this changes on a retry.                                             |
| `413`  | `{ "error": "…" }`                                                           | Request body exceeds 256 KB.                                                                                                                                                              |
| `429`  | `{ "error": "Writes to this pool are rate limited, please retry later" }`    | Pool-level rate limit, measured from the previous job's completion.                                                                                                                       |
| `429`  | `{ "error": "This API key is cooling down…" }`                               | Key-level cooldown after a deterministically bad payload.                                                                                                                                 |
| `429`  | `{ "error": "Too many requests for this API key…" }`                         | The key went over 60 requests in a minute, on any endpoint.                                                                                                                               |
| `429`  | `{ "error": "Too many requests, please retry in a moment" }`                 | The calling host went over 600 requests in a minute, counting every request from the host, matched key or not.                                                                            |
| `500`  | `{ "error": "Wrong network" }`                                               | The key's chain is no longer configured. Only reachable if a chain is retired while keys for it exist.                                                                                    |
| `502`  | `{ "error": "There was an error, please try again later" }`                  | RPC or chain error. The message is generic; provider details are never exposed.                                                                                                           |

The three rejection messages a caller is most likely to hit are worded
distinctly on purpose, so you can tell a **running job** from a **key cooldown**
from the **active-key cap**.

## Limits

- **One job in flight per pool.** A job whose runner died stops reporting and
  releases its slot, so a crash cannot wedge a pool. The write that takes the
  slot retires the abandoned job rather than leaving it to be resumed later.
- **A 60-second minimum interval between writes**, measured from the previous
  job's completion. For a large register the job itself takes longer than the
  interval, so the in-flight rule is the real limit. A `no_change` write spends
  the interval like any other: resolving the register against the chain is the
  expensive part and it ran either way, so a loop re-sending the current
  allocation is throttled the same as one re-sending a new one.
- **A 60-second key cooldown** after a payload that is deterministically wrong.
  Failures that are the platform's fault (RPC down, chain congestion) never
  trigger it, so a healthy integration is never penalized for our outage.
  Polling a job is exempt, so a bad payload never blocks you from following, or
  recovering, a write that was already accepted.
- **60 requests per minute per key**, counted across every endpoint including
  reads and job polls. Every authenticated request costs an indexer query and an
  on-chain read before its body is even read, which is what this bounds.
- **600 requests per minute per calling host**, counting every request from the
  host, matched key or not. It is the per-key limit at the active-key cap, so an
  integration cannot reach it however many keys it holds, and it exists because
  a token matching no key has no key to count against. These two request
  counters are enforced per serving instance, so treat them as budgets rather
  than exact global counts; the write interval and the in-flight rule above are
  exact.
- **10 active keys per pool.** Revoking one frees a slot.
- **1000 recipients and 256 KB per payload.**

## Authentication

**API key format:** `splitter_<base64url-encoded random bytes>`

Keys are:

- Scoped to a **single pool**. A key belongs to exactly one pool and cannot be
  pointed at another.
- Not stored in plaintext. Only a keyed hash is persisted, and the token is
  shown once on creation.
- Soft-revoked: a revoked key is rejected as missing, and revocation takes
  effect immediately. It does **not** cancel a job that was already accepted,
  and it keeps working on that job's status endpoint alone, so the polls that
  carry a half-written register to completion still land.
- Bound to the admin who minted them. A key stops working if its creator is
  removed from the pool's admin set, so removing an admin on-chain takes back
  the capability they handed out. The check reads the chain rather than the
  indexer, so a grant or a removal takes effect on the next request. Like
  cooldown and revocation, it is exempt on the job status endpoint, so the
  removal cannot strand a half-written job by locking out the polls that recover
  it. The admin page shows each key's creator alongside its label.

```
Authorization: Bearer splitter_abc123...
```

## Limitations

- **Multiple writers can overwrite each other.** With up to 10 keys per pool,
  two systems can both write, and the later write replaces the earlier one
  wholesale. Nothing detects this; the write history in the admin UI makes it
  diagnosable after the fact. Coordinating writers is the pool owner's
  responsibility.
- **Manual edits are not blocked.** A pool admin can still edit shares by hand,
  and the next API write will overwrite those changes. The admin page shows a
  notice to that effect when a pool has active keys.
- **A recipient added by hand inside the indexer's lag window can be missed.**
  If a human adds a brand new recipient and an API write happens before the
  indexer catches up, that recipient is in neither source and keeps their
  shares, so the pool's total exceeds 1,000,000 and every percentage is slightly
  off until the next write picks them up. Superfluid provides no way to
  enumerate a pool's members on-chain, so this window is inherent.

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
