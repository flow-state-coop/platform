import { db } from "../../db";
import { errorResponse } from "../../utils";
import { allowRequest, clientIdentifier } from "../../rateLimit";
import { getNetwork } from "../pool";
import { isPoolUnlocked } from "../unlock";
import { splitterQuerySchema } from "../validation";

export const dynamic = "force-dynamic";

// The only route here with no credential at all, so it is limited by origin
// rather than by caller. One DB lookup per page load is the real traffic.
const STATUS_REQUEST_LIMIT = 60;
const STATUS_REQUEST_WINDOW_MS = 60_000;

let warnedAboutMissingClientHeader = false;

/**
 * Whether a pool is API-controlled, for the notice on the Share Register, and
 * whether its writes are unlocked, for the API card's payment section.
 *
 * Deliberately unauthenticated and deliberately bare booleans. Manual editing
 * needs only a connected wallet, so an admin who never signs in is exactly the
 * person the notice is for, and gating it behind SIWE like the key list would
 * hide it from them. Nothing about a key is exposed: whether a pool is driven
 * by the API is already visible on-chain from the bot holding admin, and
 * whether it is unlocked from the payment sitting on the bot's address.
 */
export async function GET(request: Request) {
  try {
    const client = clientIdentifier(request.headers);

    // Said once per instance so a misconfigured deployment is visible without a
    // line per request.
    if (client === "unknown" && !warnedAboutMissingClientHeader) {
      warnedAboutMissingClientHeader = true;
      console.warn(
        "Neither x-vercel-forwarded-for nor x-real-ip is set: the splitter status limit is shared across all callers",
      );
    }

    if (
      !allowRequest(
        "splitter-status",
        client,
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

    const [activeKey, poolUnlocked] = await Promise.all([
      db
        .selectFrom("splitterApiKeys")
        .select("id")
        .where("chainId", "=", parsed.data.chainId)
        .where("poolId", "=", parsed.data.poolId)
        .where("revokedAt", "is", null)
        .limit(1)
        .executeTakeFirst(),
      isPoolUnlocked(parsed.data.chainId, parsed.data.poolId),
    ]);

    return Response.json({
      success: true,
      hasActiveKeys: !!activeKey,
      unlocked: poolUnlocked,
    });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
