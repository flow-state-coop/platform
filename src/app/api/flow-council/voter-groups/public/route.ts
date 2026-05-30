import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../../db";
import { networks } from "@/lib/networks";
import { errorResponse } from "../../../utils";
import { findRoundByCouncil } from "../../auth";

export const revalidate = 60;

const queryParamsSchema = z.object({
  chainId: z.coerce
    .number()
    .refine((id) => networks.some((n) => n.id === id), "Wrong network"),
  councilId: z.string().refine(isAddress, "Invalid council ID"),
});

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
      return new Response(JSON.stringify({ groups: [] }));
    }

    const rows = await db
      .selectFrom("voterGroups")
      .leftJoin(
        "voterGroupMembers",
        "voterGroupMembers.voterGroupId",
        "voterGroups.id",
      )
      .select([
        "voterGroups.id as groupId",
        "voterGroups.name as name",
        "voterGroups.eligibilityMethod as eligibilityMethod",
        "voterGroupMembers.address as address",
      ])
      .where("voterGroups.roundId", "=", round.id)
      .orderBy("voterGroups.id", "asc")
      .execute();

    const byGroup = new Map<
      number,
      { name: string; eligibilityMethod: string; members: string[] }
    >();

    for (const row of rows) {
      let group = byGroup.get(row.groupId);
      if (!group) {
        group = {
          name: row.name,
          eligibilityMethod: row.eligibilityMethod,
          members: [],
        };
        byGroup.set(row.groupId, group);
      }
      if (row.address) {
        group.members.push(row.address);
      }
    }

    return new Response(
      JSON.stringify({ groups: Array.from(byGroup.values()) }),
    );
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
