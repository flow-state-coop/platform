import { isAddress } from "viem";
import { db } from "../db";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId, councilId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(JSON.stringify({ success: true, applications: [] }));
    }

    const applications = await db
      .selectFrom("applications")
      .innerJoin("projects", "applications.projectId", "projects.id")
      .select([
        "applications.id",
        "applications.projectId",
        "applications.roundId",
        "applications.fundingAddress",
        "applications.status",
        "projects.details as projectDetails",
      ])
      .where("applications.roundId", "=", round.id)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        applications,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
