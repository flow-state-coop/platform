import { db } from "../../db";
import { errorResponse } from "../../utils";
import { authorizePoolAdmin } from "../auth";
import { splitterQuerySchema } from "../validation";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// An absent or unusable value falls back rather than erroring: this is a UI
// convenience route, and Number(null) is 0, which would silently return nothing.
function parseLimit(value: string | null) {
  if (value === null || value.trim() === "") {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Write history for a pool, newest first. Admin-only and never exposed through
 * the key-authenticated API: an integrator gets job status for its own writes,
 * which is what it needs to reconcile, while history spans every key on the
 * pool.
 *
 * Paginated by cursor rather than offset. An API-controlled pool can take a
 * write every minute, and a row inserted between two pages shifts an offset
 * window far enough to render a write the caller has already seen.
 *
 * The cursor is the serial id alone, never the timestamp: Postgres keeps these
 * to the microsecond and a JSON timestamp only to the millisecond, so a cursor
 * carrying one would skip any row sharing that millisecond with the row it was
 * taken from.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = splitterQuerySchema.safeParse({
      chainId: searchParams.get("chainId"),
      poolId: searchParams.get("poolId"),
    });

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { chainId, poolId } = parsed.data;

    const auth = await authorizePoolAdmin(chainId, poolId, {
      allowCachedRole: true,
    });
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const limit = parseLimit(searchParams.get("limit"));

    const rawBeforeId = searchParams.get("beforeId");
    let cursor: number | null = null;

    if (rawBeforeId !== null) {
      const beforeId = Number(rawBeforeId);

      // Falling back to the newest page would hand a caller asking for page two
      // a second copy of page one, which it would append.
      if (!Number.isInteger(beforeId) || beforeId <= 0) {
        return errorResponse("Invalid pagination cursor", 400);
      }

      cursor = beforeId;
    }

    // One extra row answers "is there a next page" without a second count query.
    let query = db
      .selectFrom("splitterWriteHistory")
      .leftJoin(
        "splitterApiKeys",
        "splitterApiKeys.id",
        "splitterWriteHistory.keyId",
      )
      .select([
        "splitterWriteHistory.id",
        "splitterWriteHistory.changedCount",
        "splitterWriteHistory.status",
        "splitterWriteHistory.txHashes",
        "splitterWriteHistory.gasCostWei",
        "splitterWriteHistory.createdAt",
        "splitterApiKeys.label as keyLabel",
      ])
      .where("splitterWriteHistory.chainId", "=", chainId)
      .where("splitterWriteHistory.poolId", "=", poolId)
      .orderBy("splitterWriteHistory.id", "desc")
      .limit(limit + 1);

    if (cursor) {
      query = query.where("splitterWriteHistory.id", "<", cursor);
    }

    const rows = await query.execute();

    return Response.json({
      success: true,
      writes: rows.slice(0, limit),
      hasMore: rows.length > limit,
    });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
