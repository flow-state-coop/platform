import { z } from "zod";
import { gql } from "@apollo/client";
import { isAddress } from "viem";
import { db } from "../db";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { errorResponse } from "../../utils";
import { findRoundByCouncil, authorizeCouncilManager } from "../auth";
import { voterGroupCreateSchema, voterGroupUpdateSchema } from "../validation";

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

type SubgraphVoter = { account: string; votingPower: string };

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

  for (;;) {
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
  await db
    .insertInto("voterGroups")
    .values({
      roundId,
      name: "Default",
      eligibilityMethod: "manual",
    })
    .onConflict((oc) => oc.columns(["roundId", "name"]).doNothing())
    .execute();

  const defaultGroup = await db
    .selectFrom("voterGroups")
    .select("id")
    .where("roundId", "=", roundId)
    .where("name", "=", "Default")
    .executeTakeFirst();

  if (!defaultGroup) return;

  const voters = await fetchAllActiveVoters(chainId, councilId);

  if (voters.length === 0) return;

  await db
    .insertInto("voterGroupMembers")
    .values(
      voters.map((address) => ({
        voterGroupId: defaultGroup.id,
        roundId,
        address,
      })),
    )
    .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
    .execute();
}

async function loadGroupsWithMembers(roundId: number) {
  const groups = await db
    .selectFrom("voterGroups")
    .select(["id", "name", "eligibilityMethod", "defaultVotingPower"])
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
    return {
      id: g.id,
      name: g.name,
      eligibilityMethod: g.eligibilityMethod,
      defaultVotingPower: g.defaultVotingPower,
      memberCount: groupMembers.length,
      members: groupMembers,
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
      return new Response(JSON.stringify({ success: true, groups: [] }));
    }

    let groups = await loadGroupsWithMembers(round.id);

    if (groups.length === 0) {
      await ensureDefaultGroup(round.id, chainId, councilId);
      groups = await loadGroupsWithMembers(round.id);
    }

    return new Response(JSON.stringify({ success: true, groups }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
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
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return errorResponse(issue.message, 400);
    }

    const inserted = await db
      .insertInto("voterGroups")
      .values({
        roundId: auth.roundId,
        name: parsed.data.name,
        eligibilityMethod: parsed.data.eligibilityMethod,
        defaultVotingPower: parsed.data.defaultVotingPower,
      })
      .onConflict((oc) => oc.columns(["roundId", "name"]).doNothing())
      .returning(["id"])
      .executeTakeFirst();

    if (!inserted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A group with that name already exists",
        }),
        { status: 409 },
      );
    }

    return new Response(JSON.stringify({ success: true, id: inserted.id }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
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
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return errorResponse(issue.message, 400);
    }

    const group = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("id", "=", id)
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (!group) {
      return errorResponse("Group not found", 404);
    }

    const updates: {
      name?: string;
      eligibilityMethod?: string;
      defaultVotingPower?: number;
    } = {};

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.eligibilityMethod !== undefined) {
      updates.eligibilityMethod = parsed.data.eligibilityMethod;
    }
    if (parsed.data.defaultVotingPower !== undefined) {
      updates.defaultVotingPower = parsed.data.defaultVotingPower;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ success: true }));
    }

    try {
      await db
        .updateTable("voterGroups")
        .set(updates)
        .where("id", "=", id)
        .where("roundId", "=", auth.roundId)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("voter_groups_round_id_name_key")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "A group with that name already exists",
          }),
          { status: 409 },
        );
      }
      throw err;
    }

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
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

    const group = await db
      .selectFrom("voterGroups")
      .select("id")
      .where("id", "=", id)
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (!group) {
      return errorResponse("Group not found", 404);
    }

    const memberCountRow = await db
      .selectFrom("voterGroupMembers")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("voterGroupId", "=", id)
      .executeTakeFirst();

    if (Number(memberCountRow?.count ?? 0) > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Group must be empty before it can be deleted",
        }),
        { status: 400 },
      );
    }

    const groupCountRow = await db
      .selectFrom("voterGroups")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("roundId", "=", auth.roundId)
      .executeTakeFirst();

    if (Number(groupCountRow?.count ?? 0) < 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A council must always have at least one group",
        }),
        { status: 400 },
      );
    }

    await db
      .deleteFrom("voterGroups")
      .where("id", "=", id)
      .where("roundId", "=", auth.roundId)
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
