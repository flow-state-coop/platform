import { isAddress } from "viem";
import { db } from "../../db";
import { errorResponse } from "../../../utils";
import { authorizeCouncilManager } from "../../auth";

export const dynamic = "force-dynamic";

// Upper bound on addresses accepted in a single batch add. Guards against a
// pathologically large paste/CSV turning into one massive INSERT that could
// time out or exhaust memory. Mirrors the profiles endpoint's 500 cap, scaled
// up since this is an authenticated manager-only write.
const MAX_BATCH_ADDRESSES = 5000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, groupId, address, addresses } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    // Accept either a single `address` or a batch `addresses` array so a bulk
    // add (paste-in / CSV of hundreds) is one round-trip instead of N.
    const rawList: unknown[] = Array.isArray(addresses)
      ? addresses
      : address !== undefined
        ? [address]
        : [];

    const valid = rawList.filter(
      (a): a is string => typeof a === "string" && isAddress(a),
    );

    if (valid.length === 0) {
      return errorResponse("No valid addresses", 400);
    }

    if (valid.length > MAX_BATCH_ADDRESSES) {
      return errorResponse(
        `Too many addresses (max ${MAX_BATCH_ADDRESSES} per request)`,
        400,
      );
    }

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return errorResponse("Invalid group id", 400);
    }

    const group = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("id", "=", groupId)
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (!group) {
      return errorResponse("Group not found", 404);
    }

    // Dedupe within the request, then a single bulk insert. The
    // UNIQUE(roundId, address) constraint + doNothing skips any address already
    // in another group on this council (single-membership: existing wins).
    const unique = Array.from(new Set(valid.map((a) => a.toLowerCase())));

    const insertedRows = await db
      .insertInto("voterGroupMembers")
      .values(
        unique.map((addr) => ({
          voterGroupId: groupId,
          roundId: auth.roundId,
          address: addr,
        })),
      )
      .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
      .returning(["id"])
      .execute();

    return Response.json({
      success: true,
      inserted: insertedRows.length > 0,
      insertedCount: insertedRows.length,
      skippedCount: unique.length - insertedRows.length,
    });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, address, newGroupId } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    if (typeof address !== "string" || !isAddress(address)) {
      return errorResponse("Invalid address", 400);
    }

    if (!Number.isInteger(newGroupId) || newGroupId <= 0) {
      return errorResponse("Invalid group id", 400);
    }

    // Single-membership is enforced by UNIQUE(roundId, address), so an address
    // identifies at most one member row per council — no member id needed.
    const member = await db
      .selectFrom("voterGroupMembers")
      .select(["id"])
      .where("roundId", "=", auth.roundId)
      .where("address", "=", address.toLowerCase())
      .executeTakeFirst();

    if (!member) {
      return errorResponse("Member not found", 404);
    }

    const newGroup = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("id", "=", newGroupId)
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (!newGroup) {
      return errorResponse("Target group not found in this council", 404);
    }

    await db
      .updateTable("voterGroupMembers")
      .set({ voterGroupId: newGroupId })
      .where("roundId", "=", auth.roundId)
      .where("address", "=", address.toLowerCase())
      .execute();

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, address, addresses } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    // Accept a single `address` or a batch `addresses` array so a bulk remove
    // clears many membership rows in one round-trip.
    const rawList: unknown[] = Array.isArray(addresses)
      ? addresses
      : address !== undefined
        ? [address]
        : [];

    const lowered = Array.from(
      new Set(
        rawList
          .filter((a): a is string => typeof a === "string" && isAddress(a))
          .map((a) => a.toLowerCase()),
      ),
    );

    if (lowered.length === 0) {
      return errorResponse("No valid addresses", 400);
    }

    if (lowered.length > MAX_BATCH_ADDRESSES) {
      return errorResponse(
        `Too many addresses (max ${MAX_BATCH_ADDRESSES} per request)`,
        400,
      );
    }

    await db
      .deleteFrom("voterGroupMembers")
      .where("roundId", "=", auth.roundId)
      .where("address", "in", lowered)
      .execute();

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
