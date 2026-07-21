import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../../db";
import { networks } from "@/lib/networks";
import { errorResponse } from "../../../utils";
import { findRoundByCouncil } from "../../auth";

export const revalidate = 60;

type PublicGroup = {
  groupId: number;
  name: string;
  eligibilityMethod: string;
  defaultVotingPower: number;
  members?: string[];
  nftContractAddress?: string | null;
  nftTokenStandard?: string | null;
  nftTokenId?: string | null;
  nftAcquisitionUrl?: string | null;
  nftCollectionName?: string | null;
};

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
    // Callers that only need the group metadata opt out of the member lists,
    // which dominate the payload on large councils.
    const includeMembers = searchParams.get("includeMembers") !== "0";

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return Response.json({ groups: [] });
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
        "voterGroups.defaultVotingPower as defaultVotingPower",
        "voterGroups.nftContractAddress as nftContractAddress",
        "voterGroups.nftTokenStandard as nftTokenStandard",
        "voterGroups.nftTokenId as nftTokenId",
        "voterGroups.nftAcquisitionUrl as nftAcquisitionUrl",
        "voterGroups.nftCollectionName as nftCollectionName",
        "voterGroupMembers.address as address",
      ])
      .where("voterGroups.roundId", "=", round.id)
      .orderBy("voterGroups.id", "asc")
      .execute();

    const byGroup = new Map<number, PublicGroup>();

    for (const row of rows) {
      let group = byGroup.get(row.groupId);
      if (!group) {
        group = {
          groupId: row.groupId,
          name: row.name,
          eligibilityMethod: row.eligibilityMethod,
          defaultVotingPower: row.defaultVotingPower,
          ...(includeMembers ? { members: [] } : {}),
          // Only nft groups carry the requirement metadata the eligibility
          // popup renders, so every other group keeps its existing shape.
          ...(row.eligibilityMethod === "nft"
            ? {
                nftContractAddress: row.nftContractAddress,
                nftTokenStandard: row.nftTokenStandard,
                nftTokenId: row.nftTokenId,
                nftAcquisitionUrl: row.nftAcquisitionUrl,
                nftCollectionName: row.nftCollectionName,
              }
            : {}),
        };
        byGroup.set(row.groupId, group);
      }
      if (row.address) {
        group.members?.push(row.address);
      }
    }

    return Response.json({ groups: Array.from(byGroup.values()) });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
