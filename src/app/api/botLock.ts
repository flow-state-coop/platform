import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { db } from "./db";

// A lease only has to cover nonce resolution plus the broadcast itself, never
// the wait for a receipt: holding it across confirmation would serialize every
// send on a chain behind the slowest one. 90s is far longer than that window
// and exists only to free a lease whose holder died mid-send.
export const LEASE_DURATION_MS = 90_000;
export const LEASE_ACQUIRE_TIMEOUT_MS = 15_000;
const LEASE_RETRY_INTERVAL_MS = 250;

// Past this age the ledger is assumed to describe a transaction that was
// dropped rather than one the RPC has not caught up to, so the RPC is trusted
// again. Without the bound, a single dropped broadcast would gap every later
// nonce from this key forever.
const NONCE_LEDGER_STALENESS_MS = 5 * 60_000;

/** Thrown when the per-chain send lease could not be acquired in time. */
export class ChainBusyError extends Error {
  constructor(chainId: number) {
    super(`Another transaction is already being sent on chain ${chainId}`);
    this.name = "ChainBusyError";
  }
}

// Column names stay snake_case in the SQL below, but `db` runs CamelCasePlugin,
// which rewrites result keys on the way out — raw queries included.
type LeaseRow = {
  lastNonce: string | null;
  lastNonceAt: Date | null;
};

/**
 * Create-or-claim in one statement, so the row does not need to pre-exist and
 * two racing acquirers cannot both win. The ON CONFLICT guard only lets a lease
 * be taken when it is free or expired; an unqualified column in the DO UPDATE
 * WHERE refers to the existing row, not to EXCLUDED.
 */
async function tryAcquire(
  chainId: number,
  holder: string,
): Promise<LeaseRow | null> {
  const result = await sql<LeaseRow>`
    INSERT INTO bot_chain_locks (chain_id, holder, acquired_at, expires_at)
    VALUES (
      ${chainId},
      ${holder},
      now(),
      now() + make_interval(secs => ${LEASE_DURATION_MS / 1000})
    )
    ON CONFLICT (chain_id) DO UPDATE
       SET holder = EXCLUDED.holder,
           acquired_at = EXCLUDED.acquired_at,
           expires_at = EXCLUDED.expires_at
     WHERE bot_chain_locks.holder IS NULL
        OR bot_chain_locks.expires_at < now()
    RETURNING last_nonce, last_nonce_at
  `.execute(db);

  return result.rows[0] ?? null;
}

/**
 * Holder-scoped so a lease that already expired and was taken by someone else
 * is never stolen back by its original owner finishing late.
 */
async function releaseLease(chainId: number, holder: string): Promise<void> {
  await sql`
    UPDATE bot_chain_locks
       SET holder = NULL, expires_at = NULL
     WHERE chain_id = ${chainId} AND holder = ${holder}
  `.execute(db);
}

/**
 * Monotonic and deliberately not holder-scoped: once a transaction is
 * broadcast it consumes that nonce whether or not we still hold the lease, so
 * the ledger must record it either way. The guard only prevents moving it
 * backwards.
 */
async function recordNonce(chainId: number, nonce: number): Promise<void> {
  await sql`
    UPDATE bot_chain_locks
       SET last_nonce = ${nonce}, last_nonce_at = now()
     WHERE chain_id = ${chainId}
       AND (last_nonce IS NULL OR last_nonce < ${nonce})
  `.execute(db);
}

/**
 * The RPC's pending count is a floor, not the truth: the public endpoints are
 * load-balanced, so a send can be answered by a node that has not yet seen our
 * previous broadcast and hand back a nonce we already used. The ledger carries
 * what we actually sent, so the higher of the two is correct.
 */
export function resolveNonce(
  pendingNonce: number,
  lastNonce: string | null,
  lastNonceAt: Date | null,
  now: number = Date.now(),
): number {
  // `== null` rather than `=== null`: a ledger column absent from a result row
  // arrives as undefined, and treating that as a usable value would read
  // getTime() off nothing.
  if (lastNonce == null || lastNonceAt == null) return pendingNonce;
  if (now - lastNonceAt.getTime() >= NONCE_LEDGER_STALENESS_MS) {
    return pendingNonce;
  }
  return Math.max(pendingNonce, Number(lastNonce) + 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialize one broadcast from the shared bot key on a chain and hand it an
 * explicit nonce.
 *
 * `broadcast` must only send the transaction and return; waiting for the
 * receipt belongs outside the lease. Sends on different chains never contend,
 * so a council ballot on Celo is unaffected by a splitter write on Base, and a
 * ballot arriving between two batches of a long splitter write is served
 * rather than queued behind the whole job.
 */
export async function withChainSend<T>(
  chainId: number,
  pendingNonce: () => Promise<number>,
  broadcast: (nonce: number) => Promise<T>,
): Promise<T> {
  const holder = randomBytes(16).toString("hex");
  const deadline = Date.now() + LEASE_ACQUIRE_TIMEOUT_MS;

  let lease = await tryAcquire(chainId, holder);
  while (!lease) {
    if (Date.now() >= deadline) throw new ChainBusyError(chainId);
    await sleep(LEASE_RETRY_INTERVAL_MS);
    lease = await tryAcquire(chainId, holder);
  }

  try {
    const nonce = resolveNonce(
      await pendingNonce(),
      lease.lastNonce,
      lease.lastNonceAt,
    );
    const result = await broadcast(nonce);
    // Recorded before the caller waits for a receipt, so a crash during
    // confirmation still leaves the nonce accounted for.
    //
    // Never allowed to reject: the transaction is already on the wire by this
    // point, and callers treat a rejection here as "nothing was sent" and roll
    // back state that the chain has already committed. A lost ledger entry is
    // recoverable, since the RPC's pending count is still a floor; a false
    // "nothing was sent" is not.
    await recordNonce(chainId, nonce).catch((err) => console.error(err));
    return result;
  } finally {
    await releaseLease(chainId, holder).catch((err) => console.error(err));
  }
}
