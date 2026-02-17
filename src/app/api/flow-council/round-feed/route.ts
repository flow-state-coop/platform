import { isAddress } from "viem";
import { db } from "../db";
import { findRoundByCouncil } from "../auth";
import { getAuthorAffiliations } from "../affiliations";
import { parseDetails, type ProjectMetadata } from "../utils";
import type { ProjectDetails } from "@/types/project";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = searchParams.get("chainId");
    const councilId = searchParams.get("councilId");

    if (!chainId || !councilId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing chainId or councilId",
        }),
      );
    }

    const chainIdNum = parseInt(chainId, 10);
    if (isNaN(chainIdNum)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid chain ID" }),
      );
    }

    if (!isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const round = await findRoundByCouncil(chainIdNum, councilId);
    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const messages = await db
      .selectFrom("messages")
      .select([
        "messages.id",
        "messages.channelType",
        "messages.authorAddress",
        "messages.content",
        "messages.messageType",
        "messages.projectId",
        "messages.createdAt",
        "messages.updatedAt",
      ])
      .where("messages.channelType", "=", "PUBLIC_ROUND")
      .where("messages.roundId", "=", round.id)
      .orderBy("messages.createdAt", "asc")
      .execute();

    const projectIds = [
      ...new Set(
        messages
          .map((m) => m.projectId)
          .filter((id): id is number => id !== null),
      ),
    ];

    const projectMetadata: Record<number, ProjectMetadata> = {};
    if (projectIds.length > 0) {
      const projects = await db
        .selectFrom("projects")
        .select(["id", "details"])
        .where("id", "in", projectIds)
        .execute();

      for (const p of projects) {
        const details = parseDetails<ProjectDetails>(p.details);
        if (details?.name) {
          projectMetadata[p.id] = {
            name: details.name,
            logoUrl: details.logoUrl ?? null,
          };
        }
      }
    }

    const authorAddresses = messages.map((m) => m.authorAddress);
    const affiliations = await getAuthorAffiliations(
      authorAddresses,
      round.id,
      chainIdNum,
      councilId,
    );

    return new Response(
      JSON.stringify({
        success: true,
        messages,
        affiliations,
        projectMetadata,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
