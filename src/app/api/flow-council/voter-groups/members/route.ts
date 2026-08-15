import { Address, isAddress } from "viem";
import { db } from "../../db";
import { errorResponse } from "../../../utils";
import { authorizeCouncilManager } from "../../auth";
import { getGroupByMethod } from "../../bot";
import {
  getCeloIdentityClient,
  loadVotingRoots,
  CELO_UNREACHABLE_ERROR,
  IDENTITY_CONFLICT_ERROR,
  INSERT_BATCH,
} from "../../gooddollar";
import { resolveVerifiedRoots } from "@/app/flow-councils/lib/goodDollarIdentity";

export const dynamic = "force-dynamic";

// Upper bound on addresses accepted in a single batch add. Guards against a
// pathologically large paste/CSV turning into one massive INSERT that could
// time out or exhaust memory. Mirrors the profiles endpoint's 500 cap, scaled
// up since this is an authenticated manager-only write.
const MAX_BATCH_ADDRESSES = 5000;

type IdentityRejection = { address: string; sameIdentityAs: string };

// Rolls the add back when a GoodDollar identity is claimed between the check
// and the insert. Carries the offending addresses so the race answers with the
// same payload the pre-check does, and the add list can flag those rows.
class IdentityAlreadyClaimed extends Error {
  constructor(readonly rejected: IdentityRejection[]) {
    super(IDENTITY_CONFLICT_ERROR);
  }
}

// Self-claim was turned on for this council while the add was in flight, so its
// identity lookups never ran and the group that just switched seeded its claims
// from a council this add was not yet part of.
class GoodDollarEnabledMidRequest extends Error {}

function identityConflictResponse(rejected: IdentityRejection[]) {
  return Response.json(
    {
      success: false,
      error: IDENTITY_CONFLICT_ERROR,
      rejectedAddresses: rejected,
    },
    { status: 409 },
  );
}

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
      let roots: Map<string, string>;

      try {
        roots = await resolveVerifiedRoots(
          getCeloIdentityClient(),
          unique as Address[],
        );
      } catch (err) {
        console.error(err);
        return errorResponse(CELO_UNREACHABLE_ERROR, 503);
      }

      const distinctRoots = Array.from(new Set(roots.values()));

      const heldBy = new Map(
        distinctRoots.length === 0
          ? []
          : (
              await db
                .selectFrom("gooddollarClaimedRoots")
                .select(["rootAddress", "address"])
                .where("roundId", "=", auth.roundId)
                .where("rootAddress", "in", distinctRoots)
                .execute()
            ).map((row) => [row.rootAddress, row.address]),
      );

      // A council that enabled GoodDollar after its voters were added carries
      // no claim for them, so a root voting here holds its identity's slot just
      // as a recorded claim would.
      const votingRoots = await loadVotingRoots(auth.roundId, distinctRoots);

      const rejected: IdentityRejection[] = [];

      for (const address of unique) {
        const root = roots.get(address);

        if (!root) {
          continue;
        }

        const holder =
          heldBy.get(root) ?? (votingRoots.has(root) ? root : undefined);

        if (holder && holder !== address) {
          rejected.push({ address, sameIdentityAs: holder });
          continue;
        }

        // Queued even when this wallet is the recorded holder already. The
        // lookup above ran outside the transaction, so a removal releasing the
        // claim in between would otherwise re-add the wallet with its identity
        // unrecorded, free for the next wallet its holder connected. The insert
        // below tolerates the row being there, it is the same claim.
        heldBy.set(root, address);
        claims.push({ rootAddress: root, address });
      }

      // All or nothing, so a paste that trips the gate leaves nothing half
      // written and the manager can fix the list and add again.
      if (rejected.length > 0) {
        return identityConflictResponse(rejected);
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
        // The same council row the voter-groups route locks before switching a
        // group to GoodDollar, so an add and that switch never interleave. The
        // identity lookups above ran before this lock, so whichever request
        // arrives second sees the other's writes and gives up rather than
        // adding wallets the switch's seed will never look up.
        await trx
          .selectFrom("rounds")
          .select("id")
          .where("id", "=", auth.roundId)
          .forUpdate()
          .execute();

        const goodDollarNow = await trx
          .selectFrom("voterGroups")
          .select("id")
          .where("roundId", "=", auth.roundId)
          .where("eligibilityMethod", "=", "gooddollar")
          .executeTakeFirst();

        if (goodDollarNow && !goodDollarGroup) {
          throw new GoodDollarEnabledMidRequest();
        }

        for (let i = 0; i < claims.length; i += INSERT_BATCH) {
          const chunk = claims.slice(i, i + INSERT_BATCH);
          const rows = await trx
            .insertInto("gooddollarClaimedRoots")
            .values(chunk.map((claim) => ({ roundId: auth.roundId, ...claim })))
            .onConflict((oc) =>
              oc.columns(["roundId", "rootAddress"]).doNothing(),
            )
            .returning(["rootAddress"])
            .execute();

          if (rows.length === chunk.length) {
            continue;
          }

          // A claim the lookup above found free but that no longer inserts was
          // taken in between, by a self-claim or another manager's add. Read
          // the holders back rather than counting rows: the wallet being added
          // may be the one that took it, which is no conflict at all.
          const landed = new Set(rows.map((row) => row.rootAddress));
          const contested = chunk.filter(
            (claim) => !landed.has(claim.rootAddress),
          );
          const holders = new Map(
            (
              await trx
                .selectFrom("gooddollarClaimedRoots")
                .select(["rootAddress", "address"])
                .where("roundId", "=", auth.roundId)
                .where(
                  "rootAddress",
                  "in",
                  contested.map((claim) => claim.rootAddress),
                )
                .execute()
            ).map((row) => [row.rootAddress, row.address]),
          );

          const rejected = contested
            .filter((claim) => {
              const holder = holders.get(claim.rootAddress);
              return holder !== undefined && holder !== claim.address;
            })
            .map((claim) => ({
              address: claim.address,
              sameIdentityAs: holders.get(claim.rootAddress) as string,
            }));

          if (rejected.length > 0) {
            throw new IdentityAlreadyClaimed(rejected);
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
        return identityConflictResponse(err.rejected);
      }

      if (err instanceof GoodDollarEnabledMidRequest) {
        return errorResponse(
          "GoodDollar eligibility was enabled for this council while these voters were being added, please try again",
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

    // Optionally scope the delete to one group. Single-membership means an
    // address sits in at most one group per council, but scoping makes the
    // contract precise: a caller removing from group A never deletes a row that
    // was concurrently moved to group B. Omitted → council-wide (back-compat).
    const scopedToGroup = Number.isInteger(groupId) && groupId > 0;

    // One transaction, so a failure between the two can't drop the voter while
    // leaving their identity claimed, which would lock it out of the council
    // with no voter to show for it.
    await db.transaction().execute(async (trx) => {
      // Claims first, then the membership rows they belong to, which is the
      // order the claim route takes them in. Taking them the other way round
      // here is a deadlock against a claim landing at the same moment, each
      // holding the row the other is waiting on.
      //
      // The subquery is the same set the delete below matches, so a
      // group-scoped delete that matches nothing still releases nothing.
      await trx
        .deleteFrom("gooddollarClaimedRoots")
        .where("roundId", "=", auth.roundId)
        .where("address", "in", (eb) => {
          const members = eb
            .selectFrom("voterGroupMembers")
            .select("address")
            .where("roundId", "=", auth.roundId)
            .where("address", "in", lowered);

          return scopedToGroup
            ? members.where("voterGroupId", "=", groupId)
            : members;
        })
        .execute();

      let query = trx
        .deleteFrom("voterGroupMembers")
        .where("roundId", "=", auth.roundId)
        .where("address", "in", lowered);

      if (scopedToGroup) {
        query = query.where("voterGroupId", "=", groupId);
      }

      await query.execute();
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
