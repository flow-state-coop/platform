import { Address, isAddress } from "viem";
import { db } from "../../db";
import { errorResponse } from "../../../utils";
import { authorizeCouncilManager } from "../../auth";
import { getGroupByMethod } from "../../bot";
import {
  createCeloIdentityClient,
  resolveVerifiedRoots,
} from "@/app/flow-councils/lib/goodDollarIdentity";

export const dynamic = "force-dynamic";

// Upper bound on addresses accepted in a single batch add. Guards against a
// pathologically large paste/CSV turning into one massive INSERT that could
// time out or exhaust memory. Mirrors the profiles endpoint's 500 cap, scaled
// up since this is an authenticated manager-only write.
const MAX_BATCH_ADDRESSES = 5000;

// Rows per INSERT statement. Mirrors the lazy-seed migration's batch so a large
// add (up to MAX_BATCH_ADDRESSES) never emits one multi-thousand-row statement.
const INSERT_BATCH = 500;

// Rolls the add back when a GoodDollar identity is claimed between the check
// and the insert.
class IdentityAlreadyClaimed extends Error {}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, address, addresses } = body;
    // Coerce so a JSON-string id ("1") from a direct API caller validates the
    // same as a number; Number.isInteger below still rejects NaN/non-integers.
    const groupId = Number(body.groupId);

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

    const unique = Array.from(new Set(valid.map((a) => a.toLowerCase())));

    // On a council with GoodDollar self-claim, a manual add is the other way an
    // identity could end up with two voters: its holder can connect any number
    // of wallets to it, and each carries a different address. Wallets belonging
    // to no verified identity resolve to nothing and are added as before.
    const goodDollarGroup = await getGroupByMethod(auth.roundId, "gooddollar");
    const claims: { rootAddress: string; address: string }[] = [];

    if (goodDollarGroup) {
      const celoPublicClient = createCeloIdentityClient();

      if (!celoPublicClient) {
        return errorResponse("Celo network missing", 500);
      }

      let roots: Map<string, string>;

      try {
        roots = await resolveVerifiedRoots(
          celoPublicClient,
          unique as Address[],
        );
      } catch (err) {
        // Fail closed: adding without the identity check is what lets an
        // identity collect a second voter.
        console.error(err);
        return errorResponse(
          "Could not reach GoodDollar on Celo to check identities, please try again",
          503,
        );
      }

      const heldBy = new Map(
        roots.size === 0
          ? []
          : (
              await db
                .selectFrom("gooddollarClaimedRoots")
                .select(["rootAddress", "address"])
                .where("roundId", "=", auth.roundId)
                .where("rootAddress", "in", Array.from(new Set(roots.values())))
                .execute()
            ).map((row) => [row.rootAddress, row.address]),
      );

      const rejected: { address: string; sameIdentityAs: string }[] = [];

      for (const address of unique) {
        const root = roots.get(address);

        if (!root) {
          continue;
        }

        const holder = heldBy.get(root);

        if (!holder) {
          heldBy.set(root, address);
          claims.push({ rootAddress: root, address });
        } else if (holder !== address) {
          rejected.push({ address, sameIdentityAs: holder });
        }
      }

      // All or nothing, so a paste that trips the gate leaves nothing half
      // written and the manager can fix the list and add again.
      if (rejected.length > 0) {
        return Response.json(
          {
            success: false,
            error:
              "Some addresses share a GoodDollar identity with a voter on this council",
            rejectedAddresses: rejected,
          },
          { status: 409 },
        );
      }
    }

    // Dedupe within the request, then insert in chunks inside one transaction:
    // the batch stays all-or-nothing without ever emitting a single
    // multi-thousand-row statement. The UNIQUE(roundId, address) constraint +
    // doNothing skips any address already in another group on this council
    // (single-membership: existing wins). The inserted addresses (conflicts are
    // skipped and not returned) are accumulated so the caller can roll back
    // exactly those rows on a later failure — skipped addresses belong to
    // another group and must not be touched.
    const insertedAddresses: string[] = [];

    try {
      await db.transaction().execute(async (trx) => {
        for (let i = 0; i < claims.length; i += INSERT_BATCH) {
          const chunk = claims.slice(i, i + INSERT_BATCH);
          const rows = await trx
            .insertInto("gooddollarClaimedRoots")
            .values(chunk.map((claim) => ({ roundId: auth.roundId, ...claim })))
            .onConflict((oc) =>
              oc.columns(["roundId", "rootAddress"]).doNothing(),
            )
            .returning(["address"])
            .execute();

          // A claim the lookup above found free but that no longer inserts was
          // taken in between, by a self-claim or another manager's add.
          if (rows.length !== chunk.length) {
            throw new IdentityAlreadyClaimed();
          }
        }

        for (let i = 0; i < unique.length; i += INSERT_BATCH) {
          const rows = await trx
            .insertInto("voterGroupMembers")
            .values(
              unique.slice(i, i + INSERT_BATCH).map((addr) => ({
                voterGroupId: groupId,
                roundId: auth.roundId,
                address: addr,
              })),
            )
            .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
            .returning(["address"])
            .execute();

          insertedAddresses.push(...rows.map((row) => row.address));
        }
      });
    } catch (err) {
      if (err instanceof IdentityAlreadyClaimed) {
        return errorResponse(
          "Some addresses share a GoodDollar identity with a voter on this council",
          409,
        );
      }

      throw err;
    }

    return Response.json({
      success: true,
      inserted: insertedAddresses.length > 0,
      insertedCount: insertedAddresses.length,
      insertedAddresses,
      skippedCount: unique.length - insertedAddresses.length,
    });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, address } = body;
    const newGroupId = Number(body.newGroupId);

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
    // Optional scope; Number(undefined) → NaN keeps the delete council-wide.
    const groupId = Number(body.groupId);

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

    let query = db
      .deleteFrom("voterGroupMembers")
      .where("roundId", "=", auth.roundId)
      .where("address", "in", lowered);

    // Optionally scope the delete to one group. Single-membership means an
    // address sits in at most one group per council, but scoping makes the
    // contract precise: a caller removing from group A never deletes a row that
    // was concurrently moved to group B. Omitted → council-wide (back-compat).
    if (Number.isInteger(groupId) && groupId > 0) {
      query = query.where("voterGroupId", "=", groupId);
    }

    const removed = await query.returning(["address"]).execute();

    // Release the GoodDollar identities the removed wallets were holding, so a
    // council can't accumulate identities that are locked out with no voter to
    // show for it. Keyed on the rows actually deleted: a group-scoped delete
    // that matched nothing must not release a claim still held elsewhere.
    if (removed.length > 0) {
      await db
        .deleteFrom("gooddollarClaimedRoots")
        .where("roundId", "=", auth.roundId)
        .where(
          "address",
          "in",
          removed.map((row) => row.address),
        )
        .execute();
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
