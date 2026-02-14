import { db } from "@/app/api/flow-council/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    if (!projectId || isNaN(Number(projectId))) {
      return Response.json({
        success: false,
        error: "Invalid project ID",
      });
    }

    const result = await db
      .selectFrom("applications")
      .innerJoin("rounds", "applications.roundId", "rounds.id")
      .select(["rounds.chainId", "rounds.flowCouncilAddress as councilId"])
      .where("applications.projectId", "=", Number(projectId))
      .executeTakeFirst();

    return Response.json({
      success: true,
      chainId: result?.chainId ?? null,
      councilId: result?.councilId ?? null,
    });
  } catch (err) {
    console.error(err);
    return Response.json({
      success: false,
      error: "Failed to fetch round info",
    });
  }
}
