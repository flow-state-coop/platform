import { sql } from "kysely";
import type { Address } from "viem";
import { db } from "../../db";
import { getBotSigner, sendBotTransaction } from "../../bot";
import { ChainBusyError } from "../../botLock";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { getNetwork, isBotPoolAdmin } from "../pool";
import { resolveCurrentRegister } from "../members";
import { recordWrittenBatch } from "../mirror";
import { diffRegister, type RegisterEntry } from "../plan";
import { BOT_NOT_ADMIN_ERROR } from "../auth";

// A job whose runner stopped reporting for this long is treated as dead and can
// be reclaimed. This is what stops a crashed runner wedging a pool until
// someone edits the database.
export const HEARTBEAT_STALE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 5;
const CHUNK_SIZE = 50;
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
  attempt: number;
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
              batch_index, tx_hashes, attempt
  `.execute(db);

  return result.rows[0] ?? null;
}

async function heartbeat(
  jobId: string,
  txHashes: string[],
  batchIndex: number,
) {
  await db
    .updateTable("splitterWriteJobs")
    .set({
      heartbeatAt: new Date(),
      txHashes,
      batchIndex,
      updatedAt: new Date(),
    })
    .where("id", "=", jobId)
    .execute();
}

async function finish(
  job: JobRow,
  status: "succeeded" | "failed",
  txHashes: string[],
  changedCount: number,
  gas: { used: bigint; costWei: bigint },
  error?: string,
) {
  await db
    .updateTable("splitterWriteJobs")
    .set({
      status,
      error: error ?? null,
      txHashes,
      heartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where("id", "=", job.id)
    .execute();

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
  if (!job) return;

  const network = getNetwork(job.chainId);
  if (!network) return;

  const target: RegisterEntry[] = job.target.map((entry) => ({
    address: entry.address,
    units: BigInt(entry.units),
  }));

  const txHashes = [...(job.txHashes ?? [])];
  let batchIndex = job.batchIndex ?? 0;
  let changedCount = 0;
  const gas = { used: 0n, costWei: 0n };

  try {
    const { account, publicClient, walletClient } = getBotSigner(network);
    const pool = await resolvePoolAddress(job);

    for (let i = 0; i < MAX_BATCHES_PER_JOB; i++) {
      // Cheaper to re-check than to burn gas on a revert, and it stops a
      // running job at a batch boundary when the grant is withdrawn.
      if (!(await isBotPoolAdmin(network, job.poolId))) {
        await finish(
          job,
          "failed",
          txHashes,
          changedCount,
          gas,
          BOT_NOT_ADMIN_ERROR,
        );
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
        await finish(job, "succeeded", txHashes, changedCount, gas);
        return;
      }

      const batch = remaining.slice(0, CHUNK_SIZE);
      changedCount += batch.length;

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
      txHashes.push(hash);
      batchIndex += 1;
      await heartbeat(job.id, txHashes, batchIndex);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new Error(`Batch transaction reverted: ${hash}`);
      }

      gas.used += receipt.gasUsed ?? 0n;
      gas.costWei +=
        (receipt.gasUsed ?? 0n) * (receipt.effectiveGasPrice ?? 0n);

      // Merged before advancing, so a job that dies here never loses what this
      // batch added.
      await recordWrittenBatch(job.chainId, job.poolId, batch);
    }

    await finish(
      job,
      "failed",
      txHashes,
      changedCount,
      gas,
      "The register did not converge within the batch limit",
    );
  } catch (err) {
    // Contention on the shared bot key is not a failure: nothing was broadcast,
    // so the job stays running with a fresh heartbeat and the caller's next
    // status poll resumes it. Failing here would manufacture the partial-write
    // state the design works to avoid.
    if (err instanceof ChainBusyError) {
      await heartbeat(job.id, txHashes, batchIndex);
      return;
    }

    console.error(err);
    await finish(
      job,
      "failed",
      txHashes,
      changedCount,
      gas,
      txHashes.length > 0
        ? "Some batches landed and one failed, so the register is inconsistent. Re-submit the same payload to repair it"
        : "The write failed before any transaction was sent",
    );
  }
}

async function resolvePoolAddress(job: JobRow): Promise<Address> {
  const { getPoolFromSubgraph } = await import("../pool");
  const pool = await getPoolFromSubgraph(job.chainId, job.poolId);
  if (!pool) throw new Error(`Pool ${job.poolId} not found`);
  return pool.poolAddress;
}
