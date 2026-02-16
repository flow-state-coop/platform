import { isAddress } from "viem";
import { db } from "../db";
import { findRoundByCouncil } from "../auth";
import { getAuthorAffiliations } from "../affiliations";

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

    const roundMessages = await db
      .selectFrom("messages")
      .select([
        "messages.id",
        "messages.channelType",
        "messages.authorAddress",
        "messages.content",
        "messages.createdAt",
        "messages.updatedAt",
      ])
      .where("messages.channelType", "=", "PUBLIC_ROUND")
      .where("messages.roundId", "=", round.id)
      .execute();

    const repostedMessages = await db
      .selectFrom("roundFeedReposts")
      .innerJoin("messages", "roundFeedReposts.messageId", "messages.id")
      .select([
        "messages.id",
        "messages.channelType",
        "messages.authorAddress",
        "messages.content",
        "messages.createdAt",
        "messages.updatedAt",
        "messages.projectId",
      ])
      .where("roundFeedReposts.roundId", "=", round.id)
      .execute();

    const projectIds = [
      ...new Set(
        repostedMessages
          .map((m) => m.projectId)
          .filter((id): id is number => id !== null),
      ),
    ];

    let projectNames: Record<number, string> = {};
    if (projectIds.length > 0) {
      const projects = await db
        .selectFrom("projects")
        .select(["id", "details"])
        .where("id", "in", projectIds)
        .execute();

      projectNames = Object.fromEntries(
        projects
          .map((p) => {
            const details =
              typeof p.details === "string" ? JSON.parse(p.details) : p.details;
            return [p.id, (details as { name?: string })?.name] as const;
          })
          .filter(
            (entry): entry is [number, string] => typeof entry[1] === "string",
          ),
      );
    }

    const allMessages = [
      ...roundMessages.map((m) => ({
        id: m.id,
        channelType: m.channelType,
        authorAddress: m.authorAddress,
        content: m.content,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        projectId: null as number | null,
      })),
      ...repostedMessages.map((m) => ({
        id: m.id,
        channelType: m.channelType,
        authorAddress: m.authorAddress,
        content: m.content,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        projectId: m.projectId,
      })),
    ].sort(
      (a, b) =>
        new Date(a.createdAt as string | Date).getTime() -
        new Date(b.createdAt as string | Date).getTime(),
    );

    const authorAddresses = allMessages.map((m) => m.authorAddress);
    const affiliations = await getAuthorAffiliations(
      authorAddresses,
      round.id,
      chainIdNum,
      councilId,
    );

    return new Response(
      JSON.stringify({
        success: true,
        messages: allMessages,
        affiliations,
        projectNames,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
