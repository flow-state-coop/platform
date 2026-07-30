import { after } from "next/server";
import { db } from "../../../db";
import { errorResponse } from "../../../utils";
import { authorizeApiKey } from "../../keyAuth";
import { HEARTBEAT_STALE_MS, runJob } from "../runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Job status, and the whole recovery mechanism.
 *
 * A poll that finds a job queued or stalled kicks the runner before returning,
 * so a crashed runner needs no cron and no scheduled infrastructure. The caller
 * already polls by design. A job nobody polls needs no rescue either: writes
 * are full replacement, so that integration's next write repairs the register.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    // Every exemption here exists so that recovery cannot be locked out by a
    // penalty or a revocation the job predates, and the cached role because a
    // poll hands out no capability beyond the status it reports.
    const auth = await authorizeApiKey(request, {
      ignoreCooldown: true,
      allowRevoked: true,
      allowCachedRole: true,
    });
    if (!auth.ok) return auth.response;

    const { jobId } = await params;

    const job = await db
      .selectFrom("splitterWriteJobs")
      .select([
        "id",
        "chainId",
        "poolId",
        "status",
        "txHashes",
        "batchIndex",
        "payloadHash",
        "error",
        "heartbeatAt",
        "expiresAt",
        "createdAt",
      ])
      .where("id", "=", jobId)
      .executeTakeFirst();

    // Scoped to the presented key's pool, so a key cannot poll another pool's
    // jobs. Same response as a missing job, so existence is not observable.
    if (
      !job ||
      job.chainId !== auth.key.chainId ||
      job.poolId !== auth.key.poolId
    ) {
      return errorResponse("Job not found", 404);
    }

    if (new Date(job.expiresAt) < new Date()) {
      // Opportunistic expiry, so no scheduled sweep is needed.
      await db
        .deleteFrom("splitterWriteJobs")
        .where("expiresAt", "<", new Date())
        .execute()
        .catch((err) => console.error(err));
      return errorResponse("Job not found", 404);
    }

    const stalled =
      job.status === "queued" ||
      (job.status === "running" &&
        Date.now() - new Date(job.heartbeatAt).getTime() > HEARTBEAT_STALE_MS);

    if (stalled) {
      after(() => runJob(job.id).catch((err) => console.error(err)));
    }

    return Response.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        payloadHash: job.payloadHash,
        batchesCompleted: job.batchIndex,
        txHashes: job.txHashes ?? [],
        error: job.error,
        createdAt: job.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
