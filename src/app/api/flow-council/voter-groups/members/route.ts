import { isAddress } from "viem";
import { getServerSession } from "next-auth/next";
import { db } from "../../db";
import { networks } from "@/lib/networks";
import { errorResponse } from "../../../utils";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { findRoundByCouncil, hasOnChainRole } from "../../auth";

export const dynamic = "force-dynamic";

async function authorize(
  chainId: unknown,
  councilId: unknown,
): Promise<
  { ok: true; roundId: number } | { ok: false; error: string; status: number }
> {
  const network = networks.find((n) => n.id === chainId);

  if (!network) {
    return { ok: false, error: "Wrong network", status: 400 };
  }

  if (typeof councilId !== "string" || !isAddress(councilId)) {
    return { ok: false, error: "Invalid council ID", status: 400 };
  }

  const session = await getServerSession(authOptions);

  if (!session?.address) {
    return { ok: false, error: "Unauthenticated", status: 401 };
  }

  const round = await findRoundByCouncil(chainId as number, councilId);

  if (!round) {
    return { ok: false, error: "Round not found", status: 404 };
  }

  const hasRole = await hasOnChainRole(
    chainId as number,
    councilId,
    session.address,
  );

  if (!hasRole) {
    return {
      ok: false,
      error: "Not authorized to manage this council",
      status: 403,
    };
  }

  return { ok: true, roundId: round.id };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, groupId, address, addresses } = body;

    const auth = await authorize(chainId, councilId);

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

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedRows.length > 0,
        insertedCount: insertedRows.length,
        skippedCount: unique.length - insertedRows.length,
      }),
    );
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, address, newGroupId } = body;

    const auth = await authorize(chainId, councilId);

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

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, address, addresses } = body;

    const auth = await authorize(chainId, councilId);

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

    await db
      .deleteFrom("voterGroupMembers")
      .where("roundId", "=", auth.roundId)
      .where("address", "in", lowered)
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
