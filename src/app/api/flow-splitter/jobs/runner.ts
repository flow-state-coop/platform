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

/**
 * Take ownership of a job, atomically.
 *
 * A queued job can be claimed immediately (that is the `after()` runner picking
 * up its own submission); a running one only once its heartbeat has gone stale.
 * The conditional UPDATE is the only thing preventing the post-response runner
 * and a poll-triggered resume from both spending gas on the same job.
 */
export async function claimJob(jobId: string): Promise<JobRow | null> {
  const result = await sql<JobRow>`
    UPDATE splitter_write_jobs
       SET status = 'running',
           heartbeat_at = now(),
           attempt = attempt + 1,
           updated_at = now()
     WHERE id = ${jobId}
       AND attempt < ${MAX_ATTEMPTS}
       AND (
         status = 'queued'
         OR (
           status = 'running'
           AND heartbeat_at < now() - make_interval(secs => ${HEARTBEAT_STALE_MS / 1000})
         )
       )
    RETURNING id, chain_id, pool_id, key_id, payload_hash, status, target,
              batch_index, tx_hashes, changed_count, gas_used, gas_cost_wei,
              attempt, created_at
  `.execute(db);

  return result.rows[0] ?? null;
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

async function heartbeat(jobId: string, progress: JobProgress) {
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
    .where("id", "=", jobId)
    .execute();
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
    // Scoped to this runner's attempt, so a runner that was superseded cannot
    // overwrite the terminal state a newer one already wrote.
    .where("attempt", "=", job.attempt)
    .executeTakeFirst();

  if (settled.numUpdatedRows === 0n) return;

  // Bookkeeping only. A failure here must never propagate: the job's real
  // outcome is already recorded, and re-entering the catch below would report a
  // correct register as an inconsistent partial write.
  try {
    await db
      .insertInto("splitterWriteHistory")
      .values({
        chainId: job.chainId,
        poolId: job.poolId,
        keyId: job.keyId,
        jobId: job.id,
        changedCount,
        status,
        txHashes,
        gasUsed: gas.used.toString(),
        gasCostWei: gas.costWei.toString(),
      })
      .execute();

    // The minimum interval between writes is measured from the previous job's
    // completion, not from when it was accepted, so it is stamped here.
    await db
      .updateTable("splitterIntegrations")
      .set({ lastWriteAt: new Date() })
      .where("chainId", "=", job.chainId)
      .where("poolId", "=", job.poolId)
      .execute();
  } catch (err) {
    console.error(err);
  }
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

  if (
    !job ||
    job.status !== "running" ||
    job.attempt < MAX_ATTEMPTS ||
    Date.now() - new Date(job.heartbeatAt).getTime() < HEARTBEAT_STALE_MS
  ) {
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
    heartbeat(job.id, progress).catch((err) => console.error(err));
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
      await heartbeat(job.id, progress);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new Error(`Batch transaction reverted: ${hash}`);
      }

      // Counted here rather than at broadcast, so a batch that reverted or was
      // never sent is not reported as a change to the register.
      progress.changedCount += batch.length;
      progress.gas.used += receipt.gasUsed ?? 0n;
      progress.gas.costWei +=
        (receipt.gasUsed ?? 0n) * (receipt.effectiveGasPrice ?? 0n);

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

      await db
        .updateTable("splitterWriteJobs")
        .set({
          status: "queued",
          attempt: withinGrace ? Math.max(0, job.attempt - 1) : job.attempt,
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
        .execute()
        .catch((updateErr) => console.error(updateErr));
      return;
    }

    console.error(err);
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

/**
 * Drop mirrored addresses that both the chain and the indexer now agree hold
 * nothing, so the record does not grow without bound. Anything either source
 * still knows about stays, since naming addresses the other two might miss is
 * the mirror's whole purpose.
 */
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
