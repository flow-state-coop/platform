import { z } from "zod";
import { gql } from "@apollo/client";
import { isAddress, Address } from "viem";
import type { Transaction } from "kysely";
import type { DB } from "@/generated/kysely";
import { db } from "../db";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { errorResponse } from "../../utils";
import { findRoundByCouncil, authorizeCouncilManager } from "../auth";
import {
  voterGroupCreateSchema,
  voterGroupUpdateSchema,
  type NftConfig,
} from "../validation";
import { getCouncilPublicClient } from "../metrics/lib";
import {
  detectNftStandard,
  verifyOverrideStandard,
  NFT_DETECTION_MESSAGES,
  type NftTokenStandard,
} from "../nft/detect";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import {
  CELO_CHAIN_ID,
  FLOW_STATE_BOT_ADDRESS,
} from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

const queryParamsSchema = z.object({
  chainId: z.coerce
    .number()
    .refine((id) => networks.some((n) => n.id === id), "Wrong network"),
  councilId: z.string().refine(isAddress, "Invalid council ID"),
});

const SUBGRAPH_VOTERS_QUERY = gql`
  query FlowCouncilVoters($councilId: String!, $skip: Int!) {
    flowCouncil(id: $councilId) {
      id
      voters(first: 1000, skip: $skip) {
        account
        votingPower
      }
    }
  }
`;

const PAGE_SIZE = 1000;

// Hard cap on subgraph pages so a buggy endpoint that always returns a full
// page can't spin forever. 100 pages = 100k voters, far beyond any real council.
const MAX_PAGES = 100;

// Cap on rows per INSERT for the lazy seed migration. A council with thousands
// of onchain voters would otherwise produce one enormous statement.
const SEED_INSERT_BATCH = 500;

// Carries an HTTP status out of a transaction callback so a guard violation
// maps to the right response instead of the generic 500 in the outer catch.
class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SubgraphVoter = { account: string; votingPower: string };

// A council uses one automated method or the other. Both strings render
// verbatim in the admin UI, so they name the method already in use.
const GOODDOLLAR_EXCLUSIVITY_ERROR =
  "This council uses GoodDollar eligibility. A council uses one automated method or the other.";
const NFT_EXCLUSIVITY_ERROR =
  "This council uses NFT Holder eligibility. A council uses one automated method or the other.";
const NFT_DUPLICATE_ERROR =
  "This council already has an NFT group for that collection";

const STANDARD_LABELS: Record<NftTokenStandard, string> = {
  erc721: "ERC-721",
  erc1155: "ERC-1155",
};

type NftColumns = {
  nftContractAddress: string | null;
  nftTokenStandard: string | null;
  nftTokenId: string | null;
  nftAcquisitionUrl: string | null;
  nftCollectionName: string | null;
};

const CLEARED_NFT_COLUMNS: NftColumns = {
  nftContractAddress: null,
  nftTokenStandard: null,
  nftTokenId: null,
  nftAcquisitionUrl: null,
  nftCollectionName: null,
};

type LockedGroup = {
  id: number;
  eligibilityMethod: string;
  nftContractAddress: string | null;
  nftTokenId: string | null;
};

/**
 * Re-probe the collection server-side and turn a validated config into the
 * five nft columns as one unit. The submitted standard is only trusted when
 * detection agrees with it, or when detection is inconclusive *and* the
 * contract structurally answers the chosen standard: an ordinary ERC-20 lands
 * in no_erc165, and accepting one would grant votes to every token holder.
 */
async function resolveNftColumns(
  chainId: number,
  config: NftConfig,
): Promise<NftColumns> {
  const network = networks.find((n) => n.id === chainId);

  if (!network) {
    throw new HttpError("Wrong network", 400);
  }

  const contractAddress = config.contractAddress as Address;
  const client = getCouncilPublicClient(network);
  const detection = await detectNftStandard(client, contractAddress);

  let collectionName = config.collectionName ?? null;

  if (detection.status === "detected") {
    if (detection.standard !== config.tokenStandard) {
      throw new HttpError(
        `That contract is an ${STANDARD_LABELS[detection.standard]} collection, not ${STANDARD_LABELS[config.tokenStandard]}.`,
        400,
      );
    }
    collectionName = detection.collectionName ?? collectionName;
  } else if (
    detection.status === "no_erc165" ||
    detection.status === "unsupported_interface"
  ) {
    const verification = await verifyOverrideStandard(
      client,
      contractAddress,
      config.tokenStandard,
    );

    if (!verification.ok) {
      throw new HttpError(NFT_DETECTION_MESSAGES[verification.reason], 400);
    }
  } else {
    throw new HttpError(NFT_DETECTION_MESSAGES[detection.status], 400);
  }

  return {
    nftContractAddress: config.contractAddress,
    nftTokenStandard: config.tokenStandard,
    nftTokenId: config.tokenStandard === "erc1155" ? config.tokenId : null,
    nftAcquisitionUrl: config.acquisitionUrl ?? null,
    nftCollectionName: collectionName,
  };
}

/**
 * GoodDollar and NFT gating are mutually exclusive per council, in both
 * directions. Deliberately write-time only: a council that somehow held both
 * would be frozen against new automated groups and surfaced rather than
 * repaired, while both existing paths keep working (each only ever queries its
 * own method). This is not a one-GoodDollar-group-per-council rule; several
 * gooddollar groups remain legal.
 */
function assertMethodExclusivity(
  groups: LockedGroup[],
  method: string | undefined,
  excludeId?: number,
) {
  if (method !== "nft" && method !== "gooddollar") return;

  const others = groups.filter((g) => g.id !== excludeId);

  if (
    method === "nft" &&
    others.some((g) => g.eligibilityMethod === "gooddollar")
  ) {
    throw new HttpError(GOODDOLLAR_EXCLUSIVITY_ERROR, 400);
  }

  if (
    method === "gooddollar" &&
    others.some((g) => g.eligibilityMethod === "nft")
  ) {
    throw new HttpError(NFT_EXCLUSIVITY_ERROR, 400);
  }
}

function assertNftCollectionUnique(
  groups: LockedGroup[],
  columns: NftColumns,
  excludeId?: number,
) {
  const duplicate = groups.some(
    (g) =>
      g.id !== excludeId &&
      g.eligibilityMethod === "nft" &&
      g.nftContractAddress?.toLowerCase() === columns.nftContractAddress &&
      (g.nftTokenId ?? "") === (columns.nftTokenId ?? ""),
  );

  if (duplicate) {
    throw new HttpError(NFT_DUPLICATE_ERROR, 409);
  }
}

// The pre-check above races two concurrent writers, so the partial unique index
// is the backstop and its violation carries the same message.
function asNftDuplicateError(err: unknown): HttpError | null {
  const message = err instanceof Error ? err.message : "";
  return message.includes("voter_groups_round_nft_unique")
    ? new HttpError(NFT_DUPLICATE_ERROR, 409)
    : null;
}

async function lockCouncilGroups(
  trx: Transaction<DB>,
  roundId: number,
): Promise<LockedGroup[]> {
  // Lock the council row first. Locking only the group rows leaves a council
  // with no groups yet locking an empty set, so two concurrent first creates
  // would both read "no conflicting method" and both insert, which is exactly
  // the state the exclusivity rule exists to prevent.
  await trx
    .selectFrom("rounds")
    .select("id")
    .where("id", "=", roundId)
    .forUpdate()
    .execute();

  return trx
    .selectFrom("voterGroups")
    .select(["id", "eligibilityMethod", "nftContractAddress", "nftTokenId"])
    .where("roundId", "=", roundId)
    .forUpdate()
    .execute();
}

/**
 * Fetch the full voter list from the subgraph, paginating with `skip`
 * increments until a page returns fewer than PAGE_SIZE rows. Only voters
 * with a non-zero votingPower are returned (a removed voter keeps a row
 * with votingPower "0").
 */
async function fetchAllActiveVoters(
  chainId: number,
  councilId: string,
): Promise<string[]> {
  const client = getApolloClient("flowCouncil", chainId);
  const active: string[] = [];
  let skip = 0;
  let page = 0;

  for (; page < MAX_PAGES; page++) {
    const { data } = await client.query({
      query: SUBGRAPH_VOTERS_QUERY,
      variables: { councilId: councilId.toLowerCase(), skip },
      fetchPolicy: "no-cache",
    });

    const voters: SubgraphVoter[] = data?.flowCouncil?.voters ?? [];

    for (const voter of voters) {
      if (voter.votingPower !== "0") {
        active.push(voter.account.toLowerCase());
      }
    }

    if (voters.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  if (page === MAX_PAGES) {
    console.warn(
      `fetchAllActiveVoters: hit MAX_PAGES (${MAX_PAGES}) for council ` +
        `${councilId}; voter list may be truncated`,
    );
  }

  return active;
}

/**
 * Lazily create a "Default" manual group for a council that has none yet,
 * seeding it with the current onchain voter list. Idempotent: concurrent
 * first-access requests race safely via onConflict-doNothing on both the
 * group (roundId, name) and members (roundId, address).
 */
async function ensureDefaultGroup(
  roundId: number,
  chainId: number,
  councilId: string,
): Promise<void> {
  // Read the onchain voter list before creating anything: if the subgraph is
  // slow or down, bail out so the next first-access retries the whole
  // migration. Creating the group here first would leave an empty Default group
  // that subsequent accesses skip (groups.length > 0), permanently losing the
  // seed.
  let voters: string[];
  try {
    voters = await fetchAllActiveVoters(chainId, councilId);
  } catch (err) {
    console.error(err);
    return;
  }

  // Create the group and seed its members in one transaction. If a member batch
  // fails mid-seed, the group insert rolls back with it, otherwise a half-seeded
  // Default group would survive (groups.length > 0), making every later access
  // skip the migration and leaving the group permanently under-seeded. The
  // subgraph fetch is kept outside the transaction so it never holds a DB
  // connection open across a slow external call.
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("voterGroups")
      .values({
        roundId,
        name: "Default",
        eligibilityMethod: "manual",
      })
      .onConflict((oc) => oc.columns(["roundId", "name"]).doNothing())
      .execute();

    if (voters.length === 0) return;

    const defaultGroup = await trx
      .selectFrom("voterGroups")
      .select("id")
      .where("roundId", "=", roundId)
      .where("name", "=", "Default")
      .executeTakeFirst();

    if (!defaultGroup) return;

    // Chunked so a council with thousands of voters doesn't seed in one giant
    // INSERT. onConflict + doNothing keeps each batch idempotent.
    for (let i = 0; i < voters.length; i += SEED_INSERT_BATCH) {
      await trx
        .insertInto("voterGroupMembers")
        .values(
          voters.slice(i, i + SEED_INSERT_BATCH).map((address) => ({
            voterGroupId: defaultGroup.id,
            roundId,
            address,
          })),
        )
        .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
        .execute();
    }
  });
}

async function loadGroupsWithMembers(roundId: number) {
  const groups = await db
    .selectFrom("voterGroups")
    .select([
      "id",
      "name",
      "eligibilityMethod",
      "defaultVotingPower",
      "nftContractAddress",
      "nftTokenStandard",
      "nftTokenId",
      "nftAcquisitionUrl",
      "nftCollectionName",
    ])
    .where("roundId", "=", roundId)
    .orderBy("id", "asc")
    .execute();

  const members = await db
    .selectFrom("voterGroupMembers")
    .select(["voterGroupId", "address"])
    .where("roundId", "=", roundId)
    .execute();

  const membersByGroup = new Map<number, string[]>();
  for (const m of members) {
    const list = membersByGroup.get(m.voterGroupId);
    if (list) {
      list.push(m.address);
    } else {
      membersByGroup.set(m.voterGroupId, [m.address]);
    }
  }

  return groups.map((g) => {
    const groupMembers = membersByGroup.get(g.id) ?? [];
    const group = {
      id: g.id,
      name: g.name,
      eligibilityMethod: g.eligibilityMethod,
      defaultVotingPower: g.defaultVotingPower,
      memberCount: groupMembers.length,
      members: groupMembers,
    };

    // Only nft groups carry the config, so every other group's response shape
    // stays exactly as it was.
    if (g.eligibilityMethod !== "nft") return group;

    return {
      ...group,
      nftContractAddress: g.nftContractAddress,
      nftTokenStandard: g.nftTokenStandard,
      nftTokenId: g.nftTokenId,
      nftAcquisitionUrl: g.nftAcquisitionUrl,
      nftCollectionName: g.nftCollectionName,
    };
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = queryParamsSchema.safeParse({
      chainId: searchParams.get("chainId"),
      councilId: searchParams.get("councilId"),
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return errorResponse(issue.message, 400);
    }

    const { chainId, councilId } = parsed.data;

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return Response.json({ success: true, groups: [] });
    }

    let groups = await loadGroupsWithMembers(round.id);

    if (groups.length === 0) {
      await ensureDefaultGroup(round.id, chainId, councilId);
      groups = await loadGroupsWithMembers(round.id);
    }

    return Response.json({ success: true, groups });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const parsed = voterGroupCreateSchema.safeParse({
      name: body.name,
      eligibilityMethod: body.eligibilityMethod,
      defaultVotingPower: body.defaultVotingPower,
      nftConfig: body.nftConfig,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return errorResponse(issue.message, 400);
    }

    // GoodDollar eligibility is Celo-only (the bot signs addVoter on Celo). The
    // UI already gates this, but guard the API surface too.
    if (
      parsed.data.eligibilityMethod === "gooddollar" &&
      Number(chainId) !== CELO_CHAIN_ID
    ) {
      return errorResponse(
        "GoodDollar eligibility is only available on Celo",
        400,
      );
    }

    // One metrics group per council: the bot is a single per-council voter.
    if (parsed.data.eligibilityMethod === "metrics") {
      const existing = await db
        .selectFrom("voterGroups")
        .select("id")
        .where("roundId", "=", auth.roundId)
        .where("eligibilityMethod", "=", "metrics")
        .executeTakeFirst();

      if (existing) {
        return errorResponse(
          "This council already has a metrics voter group",
          400,
        );
      }
    }

    // Probed outside the transaction below so the RPC round trip never holds
    // the council's row locks.
    const nftColumns =
      parsed.data.eligibilityMethod === "nft" && parsed.data.nftConfig
        ? await resolveNftColumns(Number(chainId), parsed.data.nftConfig)
        : null;

    // The exclusivity and duplicate guards are check-then-write, so they run in
    // one transaction with the council's group rows locked. Without the lock two
    // concurrent requests both read "no conflict" and both write.
    const inserted = await db.transaction().execute(async (trx) => {
      const groups = await lockCouncilGroups(trx, auth.roundId);

      assertMethodExclusivity(groups, parsed.data.eligibilityMethod);

      if (nftColumns) {
        assertNftCollectionUnique(groups, nftColumns);
      }

      try {
        return await trx
          .insertInto("voterGroups")
          .values({
            roundId: auth.roundId,
            name: parsed.data.name,
            eligibilityMethod: parsed.data.eligibilityMethod,
            defaultVotingPower: parsed.data.defaultVotingPower,
            ...(nftColumns ?? {}),
          })
          .onConflict((oc) => oc.columns(["roundId", "name"]).doNothing())
          .returning(["id"])
          .executeTakeFirst();
      } catch (err) {
        const duplicate = asNftDuplicateError(err);
        if (duplicate) throw duplicate;
        throw err;
      }
    });

    if (!inserted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A group with that name already exists",
        }),
        { status: 409 },
      );
    }

    return Response.json({ success: true, id: inserted.id });
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.message, err.status);
    }

    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return errorResponse("Invalid group id", 400);
    }

    const body = await request.json();
    const { chainId, councilId } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const parsed = voterGroupUpdateSchema.safeParse({
      name: body.name,
      eligibilityMethod: body.eligibilityMethod,
      defaultVotingPower: body.defaultVotingPower,
      nftConfig: body.nftConfig,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return errorResponse(issue.message, 400);
    }

    // GoodDollar eligibility is Celo-only; guard the API surface even though the
    // UI gates it (a direct call could otherwise switch a group on another chain).
    if (
      parsed.data.eligibilityMethod === "gooddollar" &&
      Number(chainId) !== CELO_CHAIN_ID
    ) {
      return errorResponse(
        "GoodDollar eligibility is only available on Celo",
        400,
      );
    }

    // One metrics group per council: the bot is a single per-council voter.
    if (parsed.data.eligibilityMethod === "metrics") {
      const existing = await db
        .selectFrom("voterGroups")
        .select("id")
        .where("roundId", "=", auth.roundId)
        .where("eligibilityMethod", "=", "metrics")
        .where("id", "!=", id)
        .executeTakeFirst();

      if (existing) {
        return errorResponse(
          "This council already has a metrics voter group",
          400,
        );
      }
    }

    const group = await db
      .selectFrom("voterGroups")
      .select(["id", "eligibilityMethod"])
      .where("id", "=", id)
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (!group) {
      return errorResponse("Group not found", 404);
    }

    // A metrics group owns an on-chain bot voter and its API keys, so its
    // eligibility method is locked after creation. The UI disables the dropdown;
    // guard the API too so a direct call can't orphan the bot or keys.
    if (
      group.eligibilityMethod === "metrics" &&
      parsed.data.eligibilityMethod !== undefined &&
      parsed.data.eligibilityMethod !== "metrics"
    ) {
      return errorResponse(
        "A metrics voter group's eligibility method cannot be changed",
        400,
      );
    }

    // The inverse: a metrics group is only valid alongside its on-chain bot
    // voter, which is added by the dedicated create flow. Switching an existing
    // group to metrics here would make a metrics DB group with no bot, so its
    // ballots would fail with "no voting power". Only POST can create metrics.
    if (
      group.eligibilityMethod !== "metrics" &&
      parsed.data.eligibilityMethod === "metrics"
    ) {
      return errorResponse(
        "A group's eligibility method cannot be changed to metrics",
        400,
      );
    }

    const resultingMethod =
      parsed.data.eligibilityMethod ?? group.eligibilityMethod;

    // An nft group's method is locked while it has members, matching the spec.
    // Editing its collection, allocation, label and link stays allowed.
    const switchesNftMethod =
      parsed.data.eligibilityMethod !== undefined &&
      parsed.data.eligibilityMethod !== group.eligibilityMethod &&
      (parsed.data.eligibilityMethod === "nft" ||
        group.eligibilityMethod === "nft");

    if (switchesNftMethod) {
      const memberCountRow = await db
        .selectFrom("voterGroupMembers")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("voterGroupId", "=", id)
        .executeTakeFirst();

      if (Number(memberCountRow?.count ?? 0) > 0) {
        return errorResponse(
          "A group's eligibility method cannot be changed to or from NFT Holder once it has members",
          400,
        );
      }
    }

    if (resultingMethod !== "nft" && parsed.data.nftConfig) {
      return errorResponse(
        "Only an NFT Holder group can carry a collection configuration",
        400,
      );
    }

    if (
      resultingMethod === "nft" &&
      group.eligibilityMethod !== "nft" &&
      !parsed.data.nftConfig
    ) {
      return errorResponse(
        "An NFT Holder group needs a collection configuration",
        400,
      );
    }

    // The five nft columns move as one unit or not at all. A field-by-field
    // merge is what leaves a group matching nobody: a 721 to 1155 switch would
    // otherwise land a 1155 standard with a null token id. A PATCH that omits
    // the config on an existing nft group leaves all five exactly as they were.
    let nftColumns: NftColumns | null = null;

    if (resultingMethod === "nft") {
      if (parsed.data.nftConfig) {
        nftColumns = await resolveNftColumns(
          Number(chainId),
          parsed.data.nftConfig,
        );
      }
    } else if (group.eligibilityMethod === "nft") {
      nftColumns = CLEARED_NFT_COLUMNS;
    }

    const updates: {
      name?: string;
      eligibilityMethod?: string;
      defaultVotingPower?: number;
    } & Partial<NftColumns> = {};

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.eligibilityMethod !== undefined) {
      updates.eligibilityMethod = parsed.data.eligibilityMethod;
    }
    if (parsed.data.defaultVotingPower !== undefined) {
      updates.defaultVotingPower = parsed.data.defaultVotingPower;
    }
    if (nftColumns) Object.assign(updates, nftColumns);

    if (Object.keys(updates).length === 0) {
      return Response.json({ success: true });
    }

    // Same check-then-write hazard as POST: switching a method into or out of
    // an automated one, and claiming a collection, both have to see a stable
    // view of the council's groups.
    await db.transaction().execute(async (trx) => {
      const groups = await lockCouncilGroups(trx, auth.roundId);

      assertMethodExclusivity(groups, parsed.data.eligibilityMethod, id);

      if (nftColumns?.nftContractAddress) {
        assertNftCollectionUnique(groups, nftColumns, id);
      }

      try {
        await trx
          .updateTable("voterGroups")
          .set(updates)
          .where("id", "=", id)
          .where("roundId", "=", auth.roundId)
          .execute();
      } catch (err) {
        const duplicate = asNftDuplicateError(err);
        if (duplicate) throw duplicate;

        const message = err instanceof Error ? err.message : "";
        if (message.includes("voter_groups_round_id_name_key")) {
          throw new HttpError("A group with that name already exists", 409);
        }
        throw err;
      }
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.message, err.status);
    }

    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return errorResponse("Invalid group id", 400);
    }

    const body = await request.json();
    const { chainId, councilId } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    // A metrics group owns the single bot voter. Deleting the DB group also
    // cascades its API keys, so confirm the bot was actually zeroed on-chain
    // first (the client removes it before calling DELETE). Done outside the
    // transaction below so the RPC read never holds the row locks. Without this,
    // a skipped/failed removal tx (or a direct DELETE) would leave the bot
    // voting on-chain with no DB record and no key left to manage it.
    const targetGroup = await db
      .selectFrom("voterGroups")
      .select(["id", "eligibilityMethod"])
      .where("id", "=", id)
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (targetGroup?.eligibilityMethod === "metrics") {
      const network = networks.find((n) => n.id === chainId);
      if (!network) {
        return errorResponse("Wrong network", 400);
      }

      const voter = await getCouncilPublicClient(network).readContract({
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "getVoter",
        args: [FLOW_STATE_BOT_ADDRESS],
      });

      if (voter.votingPower !== 0n) {
        return errorResponse(
          "Remove the metrics voter on-chain before deleting this group",
          409,
        );
      }
    }

    // Run the existence / emptiness / "at least one group" guards and the
    // delete in one transaction, locking the council's group rows up front.
    // Without the lock two concurrent deletes could both read count >= 2 and
    // both delete, leaving the council with zero groups.
    await db.transaction().execute(async (trx) => {
      const groups = await trx
        .selectFrom("voterGroups")
        .select(["id", "eligibilityMethod"])
        .where("roundId", "=", auth.roundId)
        .forUpdate()
        .execute();

      const target = groups.find((g) => g.id === id);

      if (!target) {
        throw new HttpError("Group not found", 404);
      }

      if (groups.length < 2) {
        throw new HttpError(
          "A council must always have at least one group",
          400,
        );
      }

      // A metrics group owns a single bot voter that the client zeroes on-chain
      // as part of deletion, so it may be deleted while still "populated"; its
      // membership row is cleared below. Every other method must be emptied
      // first.
      if (target.eligibilityMethod !== "metrics") {
        const memberCountRow = await trx
          .selectFrom("voterGroupMembers")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("voterGroupId", "=", id)
          .executeTakeFirst();

        if (Number(memberCountRow?.count ?? 0) > 0) {
          throw new HttpError(
            "Group must be empty before it can be deleted",
            400,
          );
        }
      }

      // Only a metrics group reaches here still holding a membership row (its
      // bot voter, zeroed on-chain by the client). Every other method passed
      // the emptiness guard above, so it is provably empty and clearing its
      // members would delete nothing.
      if (target.eligibilityMethod === "metrics") {
        await trx
          .deleteFrom("voterGroupMembers")
          .where("voterGroupId", "=", id)
          .execute();
      }

      await trx
        .deleteFrom("voterGroups")
        .where("id", "=", id)
        .where("roundId", "=", auth.roundId)
        .execute();
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.message, err.status);
    }

    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
