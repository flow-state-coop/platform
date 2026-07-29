import { sql } from "kysely";
import type { Address } from "viem";
import { CHUNK_SIZE } from "@/app/flow-councils/lib/chunkQueue";
import { db } from "../../db";
import { getBotSigner, sendBotTransaction } from "../../bot";
import { ChainBusyError } from "../../botLock";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { getNetwork, getPoolFromSubgraph, isBotPoolAdmin } from "../pool";
import { getIndexedMembers, resolveCurrentRegister } from "../members";
import { pruneMirror, recordWrittenBatch } from "../mirror";
import { diffRegister, type RegisterEntry } from "../plan";
import { BOT_NOT_ADMIN_ERROR } from "../auth";
import { PermanentError } from "../errors";
import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
} from "viem";

// A job whose runner stopped reporting for this long is treated as dead and can
// be reclaimed. This is what stops a crashed runner wedging a pool until
// someone edits the database.
export const HEARTBEAT_STALE_MS = 2 * 60_000;

// The heartbeat is refreshed on this interval for as long as a runner is alive.
// Without it a runner waiting on a slow receipt (viem's default receipt timeout
// alone is longer than the staleness threshold) would look dead while working,
// and a status poll would hand the same job to a second runner.
const HEARTBEAT_REFRESH_MS = 30_000;

const MAX_ATTEMPTS = 5;
// How long a job keeps being refunded the attempts it loses to contention on
// the shared bot key. Long enough to ride out any realistic queue on one chain,
// short enough that it fails well inside the job's own seven-day expiry.
const CHAIN_BUSY_GRACE_MS = 30 * 60_000;
// A batch always shrinks the diff, so this only bounds a pathological case
// where the chain refuses to converge.
const MAX_BATCHES_PER_JOB = 200;

export type JobRow = {
  id: string;
  chainId: number;
  poolId: string;
  keyId: number;
  payloadHash: string;
  status: string;
  target: { address: string; units: string }[];
  batchIndex: number;
  txHashes: string[];
  changedCount: number;
  gasUsed: string;
  gasCostWei: string;
  attempt: number;
  createdAt: Date;
};

export const SUPERSEDED_ERROR =
  "Superseded by a newer write to this pool. Its allocation is the one that stands";

// Guards every update to a job row. A runner scopes its writes to the attempt it
// claimed and to a job still in flight, so one that was superseded, or that lost
// its claim to a successor, cannot clobber the accounting or the terminal state
// the winner already wrote.
const IN_FLIGHT = ["queued", "running"] as const;

/**
 * Take ownership of a job, atomically.
 *
 * A queued job can be claimed immediately (that is the `after()` runner picking
 * up its own submission); a running one only once its heartbeat has gone stale.
 * The conditional UPDATE is the only thing preventing the post-response runner
 * and a poll-triggered resume from both spending gas on the same job.
 *
 * A job the pool has moved past is refused outright. Reclaiming one would put
 * two runners on the same pool driving it toward different targets, each undoing
 * the other's batches until one happens to finish last.
 */
export async function claimJob(jobId: string): Promise<JobRow | null> {
  const result = await sql<JobRow>`
    UPDATE splitter_write_jobs AS job
       SET status = 'running',
           heartbeat_at = now(),
           attempt = attempt + 1,
           updated_at = now()
     WHERE job.id = ${jobId}
       AND job.attempt < ${MAX_ATTEMPTS}
       AND (
         job.status = 'queued'
         OR (
           job.status = 'running'
           AND job.heartbeat_at < now() - make_interval(secs => ${HEARTBEAT_STALE_MS / 1000})
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM splitter_write_jobs AS newer
          WHERE newer.chain_id = job.chain_id
            AND newer.pool_id = job.pool_id
            AND newer.id <> job.id
            AND newer.status IN ('queued', 'running')
            AND newer.created_at > job.created_at
       )
    RETURNING job.id, job.chain_id, job.pool_id, job.key_id, job.payload_hash,
              job.status, job.target, job.batch_index, job.tx_hashes,
              job.changed_count, job.gas_used, job.gas_cost_wei, job.attempt,
              job.created_at
  `.execute(db);

  return result.rows[0] ?? null;
}

/**
 * Retire the jobs a newly accepted write replaces.
 *
 * A job whose runner died is left non-terminal on purpose, so a crash cannot
 * wedge the pool. The cost is that nothing else marks it done: its caller's poll
 * loop would never end, and the poll itself would resurrect it. Accepting a
 * newer write for the same pool is what settles it.
 *
 * `exceptJobId` is null when the write that supersedes them needed no job of its
 * own, which is a register that already matched. That still moves the pool past
 * anything older, since the old job would drag it back to its own target.
 */
export async function supersedeJobs(
  chainId: number,
  poolId: string,
  exceptJobId: string | null,
): Promise<void> {
  const superseded = await db
    .updateTable("splitterWriteJobs")
    .set({
      status: "failed",
      error: SUPERSEDED_ERROR,
      heartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where("chainId", "=", chainId)
    .where("poolId", "=", poolId)
    .where("status", "in", IN_FLIGHT)
    .$if(exceptJobId !== null, (qb) => qb.where("id", "!=", exceptJobId!))
    .returningAll()
    .execute();

  for (const job of superseded) {
    await recordHistory(job, "failed", progressOf(job));
  }
}

/**
 * What the job has actually done so far, carried on the row rather than in the
 * runner. A resumed attempt inherits it, so what the write changed and what it
 * cost describe the whole job and not just the attempt that happened to finish
 * it. Only batches whose receipt came back successful count.
 */
type JobProgress = {
  txHashes: string[];
  batchIndex: number;
  changedCount: number;
  gas: { used: bigint; costWei: bigint };
};

function progressOf(job: {
  txHashes: string[] | null;
  batchIndex: number | null;
  changedCount: number | null;
  gasUsed: string | null;
  gasCostWei: string | null;
}): JobProgress {
  return {
    txHashes: [...(job.txHashes ?? [])],
    batchIndex: job.batchIndex ?? 0,
    changedCount: job.changedCount ?? 0,
    gas: {
      used: BigInt(job.gasUsed ?? "0"),
      costWei: BigInt(job.gasCostWei ?? "0"),
    },
  };
}

async function heartbeat(job: JobRow, progress: JobProgress) {
  await db
    .updateTable("splitterWriteJobs")
    .set({
      heartbeatAt: new Date(),
      txHashes: progress.txHashes,
      batchIndex: progress.batchIndex,
      changedCount: progress.changedCount,
      gasUsed: progress.gas.used.toString(),
      gasCostWei: progress.gas.costWei.toString(),
      updatedAt: new Date(),
    })
    .where("id", "=", job.id)
    .where("attempt", "=", job.attempt)
    .where("status", "in", IN_FLIGHT)
    .execute();
}

/**
 * Whether retrying this could only produce the same answer.
 *
 * The distinction is "the chain rejected this" against "we never got an answer
 * from it". A revert is deterministic, and viem raises one at simulation time as
 * readily as it reports one on a receipt, so it has to be recognised in the
 * error chain rather than only on the receipt status.
 */
function isPermanent(err: unknown): boolean {
  if (err instanceof PermanentError) return true;

  return (
    err instanceof BaseError &&
    err.walk(
      (cause) =>
        cause instanceof ExecutionRevertedError ||
        cause instanceof ContractFunctionRevertedError,
    ) !== null
  );
}

async function requeue(job: JobRow, progress: JobProgress, attempt: number) {
  await db
    .updateTable("splitterWriteJobs")
    .set({
      status: "queued",
      attempt,
      heartbeatAt: new Date(),
      txHashes: progress.txHashes,
      batchIndex: progress.batchIndex,
      changedCount: progress.changedCount,
      gasUsed: progress.gas.used.toString(),
      gasCostWei: progress.gas.costWei.toString(),
      updatedAt: new Date(),
    })
    .where("id", "=", job.id)
    .where("attempt", "=", job.attempt)
    .where("status", "in", IN_FLIGHT)
    .execute()
    .catch((err) => console.error(err));
}

/**
 * Bookkeeping only. A failure here must never propagate: the job's real outcome
 * is already recorded, and re-entering the catch in `runJob` would report a
 * correct register as an inconsistent partial write.
 */
async function recordHistory(
  job: { id: string; chainId: number; poolId: string; keyId: number },
  status: "succeeded" | "failed",
  progress: JobProgress,
) {
  try {
    await db
      .insertInto("splitterWriteHistory")
      .values({
        chainId: job.chainId,
        poolId: job.poolId,
        keyId: job.keyId,
        jobId: job.id,
        changedCount: progress.changedCount,
        status,
        txHashes: progress.txHashes,
        gasUsed: progress.gas.used.toString(),
        gasCostWei: progress.gas.costWei.toString(),
      })
      .execute();
  } catch (err) {
    console.error(err);
  }
}

async function finish(
  job: JobRow,
  status: "succeeded" | "failed",
  progress: JobProgress,
  error?: string,
) {
  const { txHashes, changedCount, gas } = progress;

  const settled = await db
    .updateTable("splitterWriteJobs")
    .set({
      status,
      error: error ?? null,
      txHashes,
      changedCount,
      gasUsed: gas.used.toString(),
      gasCostWei: gas.costWei.toString(),
      heartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where("id", "=", job.id)
    .where("attempt", "=", job.attempt)
    .where("status", "in", IN_FLIGHT)
    .executeTakeFirst();

  if (settled.numUpdatedRows === 0n) return;

  await recordHistory(job, status, progress);

  // The minimum interval between writes is measured from the previous job's
  // completion, not from when it was accepted, so it is stamped here.
  await db
    .updateTable("splitterIntegrations")
    .set({ lastWriteAt: new Date() })
    .where("chainId", "=", job.chainId)
    .where("poolId", "=", job.poolId)
    .execute()
    .catch((err) => console.error(err));
}

/**
 * A job nobody can claim any more, because it burned through its attempts, has
 * to be told to the caller. Left alone it would sit at `running` with no error
 * until it expired, and an integrator's poll loop would never terminate.
 */
async function failExhausted(jobId: string): Promise<void> {
  const job = await db
    .selectFrom("splitterWriteJobs")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirst();

  if (!job || job.attempt < MAX_ATTEMPTS) {
    return;
  }

  // A runner that stopped reporting has to be waited out, in case it is still
  // alive and mid-batch. A queued job at the attempt cap has no runner to wait
  // for: `claimJob` refuses it from here on, so nothing will ever pick it up
  // again and it is already terminal in everything but name.
  const abandoned =
    job.status === "running" &&
    Date.now() - new Date(job.heartbeatAt).getTime() >= HEARTBEAT_STALE_MS;

  if (!abandoned && job.status !== "queued") {
    return;
  }

  const progress = progressOf(job);

  await finish(
    job as unknown as JobRow,
    "failed",
    progress,
    progress.changedCount > 0
      ? "Some batches landed and the write did not complete after repeated attempts, so the register is inconsistent. Re-submit the same payload to repair it"
      : "The write did not complete after repeated attempts",
  );
}

/**
 * Drive a job to completion, one batch per iteration.
 *
 * The diff is re-derived from chain state before every batch rather than
 * replaying a stored partition, so a resumed job converges on the target
 * instead of repeating work, and a transaction that landed while the runner was
 * dead is absorbed rather than sent again. `batch_index` is therefore a
 * progress counter, not an offset.
 *
 * The key is never re-validated: revoking a key blocks new submissions but does
 * not cancel a job that was already accepted.
 */
export async function runJob(jobId: string): Promise<void> {
  const job = await claimJob(jobId);
  if (!job) {
    await failExhausted(jobId).catch((err) => console.error(err));
    return;
  }

  const progress = progressOf(job);

  const network = getNetwork(job.chainId);
  if (!network) {
    await finish(job, "failed", progress, "Unsupported network");
    return;
  }

  const target: RegisterEntry[] = job.target.map((entry) => ({
    address: entry.address,
    units: BigInt(entry.units),
  }));

  // Keeps the job visibly alive across receipt waits and subgraph reads, which
  // together run longer than the staleness threshold.
  const ticker = setInterval(() => {
    heartbeat(job, progress).catch((err) => console.error(err));
  }, HEARTBEAT_REFRESH_MS);

  try {
    const { account, publicClient, walletClient } = getBotSigner(network);
    const pool = await resolvePoolAddress(job);

    for (let i = 0; i < MAX_BATCHES_PER_JOB; i++) {
      // Cheaper to re-check than to burn gas on a revert, and it stops a
      // running job at a batch boundary when the grant is withdrawn.
      if (!(await isBotPoolAdmin(network, job.poolId))) {
        await finish(job, "failed", progress, BOT_NOT_ADMIN_ERROR);
        return;
      }

      const current = await resolveCurrentRegister(
        network,
        job.poolId,
        pool,
        target.map((entry) => entry.address),
      );

      const remaining = diffRegister(target, current);
      if (remaining.length === 0) {
        await pruneSettledAddresses(job, network.id, pool, current);
        await finish(job, "succeeded", progress);
        return;
      }

      const batch = remaining.slice(0, CHUNK_SIZE);

      const hash = await sendBotTransaction(network, (nonce) =>
        walletClient.writeContract({
          account,
          nonce,
          address: network.flowSplitter as Address,
          abi: flowSplitterAbi,
          functionName: "updateMembersUnits",
          args: [
            BigInt(job.poolId),
            batch.map((entry) => ({
              account: entry.address as Address,
              units: entry.units,
            })),
          ],
        }),
      );

      // Recorded before waiting for the receipt, so a crash in between leaves a
      // findable orphan rather than an untraceable one.
      progress.txHashes.push(hash);
      progress.batchIndex += 1;
      await heartbeat(job, progress);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new PermanentError(`Batch transaction reverted: ${hash}`);
      }

      // Counted here rather than at broadcast, so a batch that reverted or was
      // never sent is not reported as a change to the register.
      progress.changedCount += batch.length;
      progress.gas.used += receipt.gasUsed ?? 0n;
      progress.gas.costWei +=
        (receipt.gasUsed ?? 0n) * (receipt.effectiveGasPrice ?? 0n);

      // Persisted before anything slower runs, so a kill between here and the
      // next batch cannot lose what this one changed and have the job report a
      // register it did move as untouched.
      await heartbeat(job, progress);

      // Merged before advancing, so a job that dies here never loses what this
      // batch added.
      await recordWrittenBatch(job.chainId, job.poolId, batch);
    }

    await finish(
      job,
      "failed",
      progress,
      "The register did not converge within the batch limit",
    );
  } catch (err) {
    // Contention on the shared bot key is not a failure: nothing was broadcast.
    // The job goes back to queued so the next poll can claim it immediately;
    // leaving it running with a fresh heartbeat would lock it out of its own
    // recovery for the whole staleness window. The attempt is given back too,
    // since nothing was attempted on-chain.
    //
    // Only while the job is young, though. Refunding it forever means a job
    // that never wins the lease never exhausts either, so it sits queued until
    // its TTL expires and the caller's poll loop never terminates. Past the
    // grace window the attempt stands, so sustained contention ends in a
    // reported failure rather than silence.
    if (err instanceof ChainBusyError) {
      const withinGrace =
        Date.now() - new Date(job.createdAt).getTime() < CHAIN_BUSY_GRACE_MS;

      await requeue(
        job,
        progress,
        withinGrace ? Math.max(0, job.attempt - 1) : job.attempt,
      );
      return;
    }

    console.error(err);

    // Everything a retry could plausibly fix gets one. Our subgraph or RPC being
    // down is the likeliest way a write fails, and a receipt wait that timed out
    // usually means the transaction landed anyway, so terminally failing here
    // reports a register that did change as untouched. The retry costs nothing:
    // the diff is re-derived from the chain before every batch, so a resumed job
    // absorbs whatever landed instead of repeating it.
    //
    // The job is left running with a fresh heartbeat rather than requeued, so
    // the staleness window paces the retries. Requeuing would have the caller's
    // own poll spend all five attempts inside a few seconds, which no outage is
    // short enough for.
    if (!isPermanent(err) && job.attempt < MAX_ATTEMPTS) {
      await heartbeat(job, progress).catch((hbErr) => console.error(hbErr));
      return;
    }

    await finish(
      job,
      "failed",
      progress,
      // Branching on hashes would call a first batch that reverted a partial
      // write, when the register was never touched. Only a confirmed batch
      // leaves it inconsistent.
      progress.changedCount > 0
        ? "Some batches landed and one failed, so the register is inconsistent. Re-submit the same payload to repair it"
        : "The write failed without changing the register",
    );
  } finally {
    clearInterval(ticker);
  }
}

async function pruneSettledAddresses(
  job: JobRow,
  chainId: number,
  poolAddress: Address,
  current: RegisterEntry[],
): Promise<void> {
  try {
    const indexedUnits = new Map(
      (await getIndexedMembers(chainId, poolAddress)).map((member) => [
        member.address,
        member.units,
      ]),
    );
    // Membership is the wrong test: the indexer keeps a PoolMember entity at
    // zero units forever, so an address the platform zeroed is always still
    // "known" and nothing would ever be pruned.
    const settled = current
      .filter(
        (entry) =>
          entry.units === 0n && (indexedUnits.get(entry.address) ?? 0n) === 0n,
      )
      .map((entry) => entry.address);

    await pruneMirror(job.chainId, job.poolId, settled);
  } catch (err) {
    console.error(err);
  }
}

async function resolvePoolAddress(job: JobRow): Promise<Address> {
  const pool = await getPoolFromSubgraph(job.chainId, job.poolId);
  if (!pool) throw new Error(`Pool ${job.poolId} not found`);
  return pool.poolAddress;
}
