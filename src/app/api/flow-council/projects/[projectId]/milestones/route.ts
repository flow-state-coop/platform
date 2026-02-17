import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { db } from "@/app/api/flow-council/db";
import { isProjectManager } from "@/app/api/flow-council/auth";
import { parseDetails } from "@/app/api/flow-council/utils";
import { milestoneProgressSchema } from "@/app/api/flow-council/validation";
import type { RoundForm } from "@/app/flow-councils/types/round";
import type {
  ApplicationMilestones,
  MilestoneWithProgress,
  MilestoneProgressData,
  EvidenceLink,
} from "@/app/projects/[id]/milestones/types";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ projectId: string }> };

function emptyProgress(itemCount: number): MilestoneProgressData {
  return {
    otherDetails: "",
    items: Array.from({ length: itemCount }, () => ({
      completion: 0,
      evidence: [],
    })),
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    if (!projectId || isNaN(Number(projectId))) {
      return Response.json({ success: false, error: "Invalid project ID" });
    }

    const pid = Number(projectId);

    const applications = await db
      .selectFrom("applications")
      .innerJoin("rounds", "applications.roundId", "rounds.id")
      .select([
        "applications.id as applicationId",
        "applications.details as appDetails",
        "rounds.details as roundDetails",
      ])
      .where("applications.projectId", "=", pid)
      .where("applications.status", "=", "ACCEPTED")
      .execute();

    if (applications.length === 0) {
      return Response.json({ success: true, applications: [] });
    }

    const applicationIds = applications.map((a) => a.applicationId);

    const progressRows = await db
      .selectFrom("milestoneProgress")
      .selectAll()
      .where("applicationId", "in", applicationIds)
      .execute();

    const progressMap = new Map<string, MilestoneProgressData>();
    for (const row of progressRows) {
      const key = `${row.applicationId}-${row.milestoneType}-${row.milestoneIndex}`;
      const parsed = parseDetails<MilestoneProgressData>(row.progress);
      if (parsed) progressMap.set(key, parsed);
    }

    const result: ApplicationMilestones[] = applications.map((app) => {
      const roundDetails = parseDetails<{ name?: string }>(app.roundDetails);
      const appDetails = parseDetails<RoundForm>(app.appDetails);
      const milestones: MilestoneWithProgress[] = [];

      if (appDetails?.buildGoals?.milestones) {
        appDetails.buildGoals.milestones.forEach((m, i) => {
          const key = `${app.applicationId}-build-${i}`;
          milestones.push({
            type: "build",
            index: i,
            title: m.title,
            description: m.description,
            itemNames: m.deliverables,
            progress:
              progressMap.get(key) ?? emptyProgress(m.deliverables.length),
          });
        });
      }

      if (appDetails?.growthGoals?.milestones) {
        appDetails.growthGoals.milestones.forEach((m, i) => {
          const key = `${app.applicationId}-growth-${i}`;
          milestones.push({
            type: "growth",
            index: i,
            title: m.title,
            description: m.description,
            itemNames: m.activations,
            progress:
              progressMap.get(key) ?? emptyProgress(m.activations.length),
          });
        });
      }

      return {
        applicationId: app.applicationId,
        roundName: roundDetails?.name ?? "Round",
        milestones,
      };
    });

    return Response.json({ success: true, applications: result });
  } catch (err) {
    console.error("Failed to fetch milestones:", err);
    return Response.json({
      success: false,
      error: "Failed to fetch milestones",
    });
  }
}

const MILESTONE_AUTHOR_ADDRESS = "0x0000000000000000000000000000000000000000";
const MILESTONE_TYPE_LABELS: Record<string, string> = {
  build: "Build",
  growth: "Growth",
};

function buildEvidencePostContent(
  roundName: string,
  typeLabel: string,
  milestoneIndex: number,
  itemIndex: number,
  evidence: EvidenceLink,
  pid: number,
): string {
  return `Evidence added to ${roundName} - ${typeLabel} Milestone ${milestoneIndex + 1} - Deliverable ${itemIndex + 1}:\n\n[${evidence.name}](${evidence.link})\n\n[Go to the milestone](/projects/${pid}?tab=milestones)`;
}

function buildTextUpdatePostContent(
  roundName: string,
  typeLabel: string,
  milestoneIndex: number,
  otherDetails: string,
  pid: number,
): string {
  return `Details updated on ${roundName} - ${typeLabel} Milestone ${milestoneIndex + 1}:\n\n${otherDetails}\n\n[Go to the milestone](/projects/${pid}?tab=milestones)`;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    if (!projectId || isNaN(Number(projectId))) {
      return Response.json({ success: false, error: "Invalid project ID" });
    }

    const pid = Number(projectId);

    const session = await getServerSession(authOptions);
    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        {
          status: 401,
        },
      );
    }

    const hasAccess = await isProjectManager(pid, session.address);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
        {
          status: 403,
        },
      );
    }

    const body = await request.json();
    const { applicationId, milestoneType, milestoneIndex, progress } = body;

    if (
      typeof applicationId !== "number" ||
      !["build", "growth"].includes(milestoneType) ||
      typeof milestoneIndex !== "number"
    ) {
      return Response.json({ success: false, error: "Invalid parameters" });
    }

    const application = await db
      .selectFrom("applications")
      .select(["id", "projectId", "roundId", "status"])
      .where("id", "=", applicationId)
      .where("projectId", "=", pid)
      .where("status", "=", "ACCEPTED")
      .executeTakeFirst();

    if (!application) {
      return Response.json({
        success: false,
        error: "Application not found or not accepted",
      });
    }

    const parsed = milestoneProgressSchema.safeParse(progress);
    if (!parsed.success) {
      return Response.json({
        success: false,
        error: parsed.error.issues[0].message,
      });
    }

    const existingRow = await db
      .selectFrom("milestoneProgress")
      .select("progress")
      .where("applicationId", "=", applicationId)
      .where("milestoneType", "=", milestoneType)
      .where("milestoneIndex", "=", milestoneIndex)
      .executeTakeFirst();

    const oldProgress = existingRow
      ? parseDetails<MilestoneProgressData>(existingRow.progress)
      : null;

    await db
      .insertInto("milestoneProgress")
      .values({
        applicationId,
        milestoneType,
        milestoneIndex,
        progress: JSON.stringify(parsed.data),
      })
      .onConflict((oc) =>
        oc
          .columns(["applicationId", "milestoneType", "milestoneIndex"])
          .doUpdateSet({
            progress: JSON.stringify(parsed.data),
          }),
      )
      .execute();

    const newProgress = parsed.data;
    const feedMessages: string[] = [];

    const roundData = await db
      .selectFrom("rounds")
      .select("details")
      .where("id", "=", application.roundId)
      .executeTakeFirst();

    const roundDetails = parseDetails<{ name?: string }>(roundData?.details);
    const roundName = roundDetails?.name ?? "Round";
    const typeLabel = MILESTONE_TYPE_LABELS[milestoneType] ?? milestoneType;

    for (let i = 0; i < newProgress.items.length; i++) {
      const newItem = newProgress.items[i];
      const oldEvidenceCount = oldProgress?.items?.[i]?.evidence?.length ?? 0;
      const newEvidence = newItem.evidence.slice(oldEvidenceCount);

      for (const evidence of newEvidence) {
        feedMessages.push(
          buildEvidencePostContent(
            roundName,
            typeLabel,
            milestoneIndex,
            i,
            evidence,
            pid,
          ),
        );
      }
    }

    if (
      newProgress.otherDetails &&
      newProgress.otherDetails !== (oldProgress?.otherDetails ?? "")
    ) {
      feedMessages.push(
        buildTextUpdatePostContent(
          roundName,
          typeLabel,
          milestoneIndex,
          newProgress.otherDetails,
          pid,
        ),
      );
    }

    if (feedMessages.length > 0) {
      const now = new Date();
      const messageRows = feedMessages.flatMap((content) => [
        {
          channelType: "PUBLIC_PROJECT" as const,
          projectId: pid,
          roundId: application.roundId,
          applicationId: null,
          authorAddress: MILESTONE_AUTHOR_ADDRESS,
          messageType: "milestone_update",
          content,
          createdAt: now,
        },
        {
          channelType: "PUBLIC_ROUND" as const,
          projectId: pid,
          roundId: application.roundId,
          applicationId: null,
          authorAddress: MILESTONE_AUTHOR_ADDRESS,
          messageType: "milestone_update",
          content,
          createdAt: now,
        },
      ]);

      await db.insertInto("messages").values(messageRows).execute();
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Failed to update milestone progress:", err);
    return Response.json({
      success: false,
      error: "Failed to update milestone progress",
    });
  }
}
