import crypto from "crypto";
import { after } from "next/server";
import { sql } from "kysely";
import { db } from "../../db";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import { authorizeApiKey, coolDownKey, touchKey } from "../keyAuth";
import { resolveCurrentRegister } from "../members";
import { isBotPoolAdmin } from "../pool";
import { planWrite, TARGET_TOTAL_UNITS } from "../plan";
import { splitterAllocationSchema } from "../validation";
import { BOT_NOT_ADMIN_ERROR } from "../auth";
import { HEARTBEAT_STALE_MS, runJob } from "../jobs/runner";

export const dynamic = "force-dynamic";

// A large register can take several transactions and a couple of minutes.
export const maxDuration = 300;

/**
 * The pool's current recipients and shares.
 *
 * Percentages are computed against the pool's actual outstanding units rather
 * than the target total, so they stay meaningful on a pool the API has not
 * written yet, and on one left mid-update by a partial write.
 */
export async function GET(request: Request) {
  try {
    const auth = await authorizeApiKey(request);
    if (!auth.ok) return auth.response;

    const { key, network, pool } = auth;

    await touchKey(key.id);

    const register = await resolveCurrentRegister(
      network,
      key.poolId,
      pool.poolAddress,
    );

    const recipients = register.filter((entry) => entry.units > 0n);
    const totalUnits = recipients.reduce((sum, e) => sum + e.units, 0n);

    return Response.json({
      success: true,
      pool: {
        chainId: network.id,
        poolId: key.poolId,
        address: pool.poolAddress,
        name: pool.name,
        symbol: pool.symbol,
        token: pool.token,
      },
      totalUnits: totalUnits.toString(),
      targetTotalUnits: TARGET_TOTAL_UNITS.toString(),
      recipients: recipients.map((entry) => ({
        address: entry.address,
        units: entry.units.toString(),
        percentage:
          totalUnits > 0n
            ? Number((entry.units * 1_000_000n) / totalUnits) / 10_000
            : 0,
      })),
    });
  } catch (err) {
    // RPC and indexer errors can embed provider URLs, so log server-side only.
    console.error(err);
    return errorResponse("There was an error, please try again later", 502);
  }
}

// 1000 entries x ~80 bytes plus JSON overhead, matching the council metrics API.
const MAX_BODY_SIZE = 256 * 1024;
const MIN_WRITE_INTERVAL_MS = 60_000;
const KEY_COOLDOWN_MS = 60_000;
const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Accept a new allocation.
 *
 * The write is asynchronous: the payload is validated, a job is created, and a
 * job id comes back immediately. A large register can take several
 * transactions and a couple of minutes, and holding an HTTP request open for
 * that is fragile.
 */
export async function POST(request: Request) {
  const auth = await authorizeApiKey(request);
  if (!auth.ok) return auth.response;

  const { key, network, pool } = auth;

  let payload;
  try {
    const json = await readJsonBody(request, MAX_BODY_SIZE);
    const parsed = splitterAllocationSchema.safeParse(json);
    if (!parsed.success) {
      // A deterministically bad payload is the caller's fault, so the key is
      // cooled down. Infrastructure failures below never do this.
      await coolDownKey(key.id, KEY_COOLDOWN_MS);
      return errorResponse(parsed.error.issues[0].message, 400);
    }
    payload = parsed.data;
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return errorResponse(err.message, 413);
    }
    return errorResponse("Invalid request body", 400);
  }

  await touchKey(key.id);

  try {
    // Refused before a job exists, which beats a job that dies on batch one.
    if (!(await isBotPoolAdmin(network, key.poolId))) {
      return errorResponse(BOT_NOT_ADMIN_ERROR, 409);
    }

    // In flight means actively reporting progress, never a bare status check:
    // a job whose runner died stops reporting and releases its slot, so a crash
    // cannot wedge a pool until someone edits the database.
    const running = await db
      .selectFrom("splitterWriteJobs")
      .select(["id", "payloadHash"])
      .where("chainId", "=", key.chainId)
      .where("poolId", "=", key.poolId)
      .where("status", "in", ["queued", "running"])
      .where("heartbeatAt", ">", new Date(Date.now() - HEARTBEAT_STALE_MS))
      .executeTakeFirst();

    if (running) {
      // The id and payload fingerprint let a caller that lost the original
      // response recover its job, and tell its own submission from someone
      // else's.
      return Response.json(
        {
          success: false,
          error:
            "A write is already running for this pool, please retry once it finishes",
          jobId: running.id,
          payloadHash: running.payloadHash,
        },
        { status: 409 },
      );
    }

    // Create-or-claim the write window, measured from the previous job's
    // completion.
    const claimed = await sql<{ pool_id: string }>`
      INSERT INTO splitter_integrations (chain_id, pool_id, last_write_at)
      VALUES (${key.chainId}, ${key.poolId}, now())
      ON CONFLICT (chain_id, pool_id) DO UPDATE
         SET last_write_at = now()
       WHERE splitter_integrations.last_write_at IS NULL
          OR splitter_integrations.last_write_at
             < now() - make_interval(secs => ${MIN_WRITE_INTERVAL_MS / 1000})
      RETURNING pool_id
    `.execute(db);

    if (claimed.rows.length === 0) {
      return errorResponse(
        "Writes to this pool are rate limited, please retry later",
        429,
      );
    }

    const current = await resolveCurrentRegister(
      network,
      key.poolId,
      pool.poolAddress,
      payload.recipients.map((r) => r.address),
    );

    const plan = planWrite(payload.recipients, current);
    const payloadHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify(plan.target.map((e) => [e.address, e.units.toString()])),
      )
      .digest("hex");

    // Verified against the chain rather than the indexer, so a resubmitted
    // payload that changed nothing costs no gas and is not recorded as a write.
    if (plan.unchanged) {
      await db
        .insertInto("splitterWriteHistory")
        .values({
          chainId: key.chainId,
          poolId: key.poolId,
          keyId: key.id,
          jobId: null,
          changedCount: 0,
          status: "no_change",
          txHashes: [],
        })
        .execute();

      return Response.json({
        success: true,
        status: "no_change",
        txHashes: [],
        recipients: plan.target.length,
      });
    }

    const jobId = crypto.randomUUID();

    await db
      .insertInto("splitterWriteJobs")
      .values({
        id: jobId,
        chainId: key.chainId,
        poolId: key.poolId,
        keyId: key.id,
        payloadHash,
        status: "queued",
        target: JSON.stringify(
          plan.target.map((e) => ({
            address: e.address,
            units: e.units.toString(),
          })),
        ),
        txHashes: [],
        expiresAt: new Date(Date.now() + JOB_TTL_MS),
      })
      .execute();

    after(() => runJob(jobId).catch((err) => console.error(err)));

    return Response.json(
      {
        success: true,
        status: "queued",
        jobId,
        payloadHash,
        changed: plan.changed.length,
        batches: plan.batches.length,
      },
      { status: 202 },
    );
  } catch (err) {
    // RPC and chain failures are ours, not the caller's, so the key is never
    // cooled down here and no provider detail is returned.
    console.error(err);
    return errorResponse("There was an error, please try again later", 502);
  }
}
