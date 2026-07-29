import { db } from "../../db";
import { errorResponse } from "../../utils";
import { allowRequest } from "../../rateLimit";
import { getNetwork } from "../pool";
import { splitterQuerySchema } from "../validation";

export const dynamic = "force-dynamic";

// The only route here with no credential at all, so it is limited by origin
// rather than by caller. One DB lookup per page load is the real traffic.
const STATUS_REQUEST_LIMIT = 60;
const STATUS_REQUEST_WINDOW_MS = 60_000;

let warnedAboutMissingClientHeader = false;

/**
 * Whether a pool is API-controlled, for the notice on the Share Register.
 *
 * Deliberately unauthenticated and deliberately a bare boolean. Manual editing
 * needs only a connected wallet, so an admin who never signs in is exactly the
 * person the notice is for, and gating it behind SIWE like the key list would
 * hide it from them. Nothing about a key is exposed: whether a pool is driven
 * by the API is already visible on-chain from the bot holding admin.
 */
export async function GET(request: Request) {
  try {
    // Read from the headers the platform sets itself. The leftmost entry of
    // x-forwarded-for is whatever the caller sent, so keying on it hands out a
    // fresh window per request and fills the shared window map with junk that
    // evicts the limits protecting the signed-in routes.
    const client =
      request.headers.get("x-vercel-forwarded-for")?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      "unknown";

    // Behind a proxy that sets neither, every caller shares one window and the
    // limit stops being per-caller. Said once per instance so a misconfigured
    // deployment is visible without a line per request.
    if (client === "unknown" && !warnedAboutMissingClientHeader) {
      warnedAboutMissingClientHeader = true;
      console.warn(
        "Neither x-vercel-forwarded-for nor x-real-ip is set: the splitter status limit is shared across all callers",
      );
    }

    if (
      !allowRequest(
        `splitter-status:${client}`,
        STATUS_REQUEST_LIMIT,
        STATUS_REQUEST_WINDOW_MS,
      )
    ) {
      return errorResponse("Too many requests, please retry in a moment", 429);
    }

    const { searchParams } = new URL(request.url);
    const parsed = splitterQuerySchema.safeParse({
      chainId: searchParams.get("chainId"),
      poolId: searchParams.get("poolId"),
    });

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Consistent with every other splitter route, so an unsupported chain is
    // refused rather than answered from an empty table.
    if (!getNetwork(parsed.data.chainId)) {
      return errorResponse("Wrong network", 400);
    }

    const activeKey = await db
      .selectFrom("splitterApiKeys")
      .select("id")
      .where("chainId", "=", parsed.data.chainId)
      .where("poolId", "=", parsed.data.poolId)
      .where("revokedAt", "is", null)
      .limit(1)
      .executeTakeFirst();

    return Response.json({ success: true, hasActiveKeys: !!activeKey });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
