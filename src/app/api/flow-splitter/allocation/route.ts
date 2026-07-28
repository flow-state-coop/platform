import { errorResponse } from "../../utils";
import { authorizeApiKey, touchKey } from "../keyAuth";
import { resolveCurrentRegister } from "../members";
import { TARGET_TOTAL_UNITS } from "../plan";

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
