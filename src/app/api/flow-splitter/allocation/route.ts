import crypto from "crypto";
import { after } from "next/server";
import { sql } from "kysely";
import { db } from "../../db";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import { authorizeApiKey, coolDownKey, touchKey } from "../keyAuth";
import { resolveCurrentRegister } from "../members";
import { findPoolRecipients, isBotPoolAdmin } from "../pool";
import { planWrite, TARGET_TOTAL_UNITS } from "../plan";
import { splitterAllocationSchema } from "../validation";
import { BOT_NOT_ADMIN_ERROR } from "../auth";
import { PermanentError } from "../errors";
import { HEARTBEAT_STALE_MS, runJob, supersedeJobs } from "../jobs/runner";

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

    if (err instanceof PermanentError) {
      return errorResponse(err.message, 409);
    }

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
  // Authorization reads the subgraph and the chain, so it fails the way they
  // do. Uncaught it would escape as a framework 500 with no body, which no
  // documented response shape covers.
  let auth;
  try {
    auth = await authorizeApiKey(request);
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 502);
  }
  if (!auth.ok) return auth.response;

  const { key, network, pool } = auth;

  // Recorded before the payload is even parsed: a key failing validation in a
  // loop is the most active a key can be, and "Last used" is what an admin
  // reads to find it.
  await touchKey(key.id);

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

  // Naming the pool itself, or the splitter contract, reverts on-chain. Caught
  // here rather than mid-job, where it would surface as a partial write with an
  // inconsistent register. The pool address is public (the read endpoint
  // returns it), so this is a caller fault and cools the key down.
  const forbidden = payload.recipients.find((recipient) => {
    const address = recipient.address.toLowerCase();
    return (
      address === pool.poolAddress.toLowerCase() ||
      address === network.flowSplitter.toLowerCase()
    );
  });
  if (forbidden) {
    await coolDownKey(key.id, KEY_COOLDOWN_MS);
    return errorResponse(
      `${forbidden.address} cannot be a recipient of its own pool`,
      400,
    );
  }

  let claimedAt: Date | null = null;
  let previousWriteAt: Date | null = null;

  // Handing the write window back, for a refusal that leaves no job behind to
  // ever stamp a completion. Guarded on our own timestamp, so a claim since
  // taken by someone else is not disturbed.
  const releaseWriteWindow = async () => {
    if (!claimedAt) return;

    await db
      .updateTable("splitterIntegrations")
      .set({ lastWriteAt: previousWriteAt })
      .where("chainId", "=", key.chainId)
      .where("poolId", "=", key.poolId)
      .where("lastWriteAt", "=", claimedAt)
      .execute()
      .catch((resetErr) => console.error(resetErr));
  };

  try {
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
    // completion. The claim stamps an explicit timestamp rather than now(), so
    // the catch below can hand the window back on a failure that was ours.
    const existing = await db
      .selectFrom("splitterIntegrations")
      .select(["lastWriteAt"])
      .where("chainId", "=", key.chainId)
      .where("poolId", "=", key.poolId)
      .executeTakeFirst();
    previousWriteAt = existing?.lastWriteAt ?? null;
    claimedAt = new Date();

    const claimed = await sql<{ poolId: string }>`
      INSERT INTO splitter_integrations (chain_id, pool_id, last_write_at)
      VALUES (${key.chainId}, ${key.poolId}, ${claimedAt})
      ON CONFLICT (chain_id, pool_id) DO UPDATE
         SET last_write_at = ${claimedAt}
       WHERE splitter_integrations.last_write_at IS NULL
          OR splitter_integrations.last_write_at
             < ${new Date(claimedAt.getTime() - MIN_WRITE_INTERVAL_MS)}
      RETURNING pool_id
    `.execute(db);

    if (claimed.rows.length === 0) {
      claimedAt = null;
      return errorResponse(
        "Writes to this pool are rate limited, please retry later",
        429,
      );
    }

    // Both chain reads below sit behind the two refusals above, which cost a
    // query each. Ahead of them a caller looping valid payloads would be
    // refused every time and still drive an eth_call and a multicall over its
    // whole payload per request, against the same endpoint the bot broadcasts
    // through, which is the work the per-key limit exists to bound.

    // Refused before a job exists, which beats a job that dies on batch one.
    // The window goes back: the pool is not the caller's to fix, and no job
    // will ever stamp a completion to release it.
    if (!(await isBotPoolAdmin(network, key.poolId))) {
      await releaseWriteWindow();
      return errorResponse(BOT_NOT_ADMIN_ERROR, 409);
    }

    // The string check above catches this pool; any other GDA pool has to be
    // read from the chain. Both revert the same way, and a revert is permanent,
    // so the whole payload is refused before a job can half-write the register.
    const nested = await findPoolRecipients(
      network,
      pool.token,
      payload.recipients.map((recipient) => recipient.address),
    );
    if (nested.length > 0) {
      // The window stays claimed, for the same reason the no-change path keeps
      // it: the multicall already ran, and it is the expensive part. The key's
      // own cooldown is the same 60 seconds, so a caller correcting the payload
      // waits no longer than it already would.
      await coolDownKey(key.id, KEY_COOLDOWN_MS);
      return errorResponse(
        `${nested[0]} is a Superfluid pool, and a pool cannot hold shares in another pool`,
        400,
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
      // Nothing to write, but the pool has still moved past any job left open
      // by a dead runner: resuming one would drag the register back to the
      // target it was chasing.
      await supersedeJobs(key.chainId, key.poolId, null).catch((err) =>
        console.error(err),
      );

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
          // Zero, not null: no transaction was sent, so the cost is known to be
          // nothing rather than unrecorded. Null is what a row predating gas
          // accounting means, and a total over the column should not have to
          // tell the two apart.
          gasUsed: "0",
          gasCostWei: "0",
        })
        .execute();

      // The window stays claimed. No transaction was sent, but resolving the
      // register against the chain is the expensive part and it already ran, so
      // handing the window back would let a loop resubmitting the current
      // register drive that work and a history row without limit.
      return Response.json({
        success: true,
        status: "no_change",
        txHashes: [],
        recipients: plan.target.length,
      });
    }

    const jobId = crypto.randomUUID();

    // Also swept here, not only when a job is polled: a caller that submits and
    // never polls, or gives up on a failure, would otherwise leave its rows
    // behind for good. Any pool still being written now cleans up after itself.
    await db
      .deleteFrom("splitterWriteJobs")
      .where("expiresAt", "<", new Date())
      .execute()
      .catch((err) => console.error(err));

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

    // Only reached past the in-flight check above, so anything still open here
    // is a job whose runner stopped reporting. Retiring it is what stops a poll
    // on the old job resurrecting it to race this one toward a target the pool
    // has already moved past. Ordered after the insert, so the new job is
    // visible to `claimJob`'s own guard for the whole window.
    await supersedeJobs(key.chainId, key.poolId, jobId).catch((err) =>
      console.error(err),
    );

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

    // Hand the write window back too. No job exists, so nothing will ever stamp
    // a completion, and leaving it claimed would lock the caller out for a
    // minute because of our outage.
    await releaseWriteWindow();

    // A condition no retry can clear, a pool with more members than the API can
    // enumerate, told to the caller. A 502 would have it retry forever while the
    // one actionable thing about the refusal stayed in our logs.
    if (err instanceof PermanentError) {
      return errorResponse(err.message, 409);
    }

    return errorResponse("There was an error, please try again later", 502);
  }
}
