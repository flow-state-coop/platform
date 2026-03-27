import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { db } from "@/app/api/flow-council/db";
import { isProjectManager } from "@/app/api/flow-council/auth";
import { parseDetails } from "@/app/api/flow-council/utils";
import {
  milestoneProgressSchema,
  milestoneDefinitionSchema,
} from "@/app/api/flow-council/validation";
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
        "applications.editsUnlocked",
        "rounds.details as roundDetails",
        "rounds.chainId",
        "rounds.flowCouncilAddress as councilId",
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
        chainId: app.chainId,
        councilId: app.councilId,
        editsUnlocked: app.editsUnlocked ?? false,
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

const MILESTONE_ITEM_LABELS: Record<string, string> = {
  build: "Deliverable",
  growth: "Activation",
};

function buildEvidencePostContent(
  verb: "added to" | "updated on",
  roundName: string,
  milestoneType: string,
  typeLabel: string,
  milestoneIndex: number,
  itemIndex: number,
  itemLabel: string,
  completion: number,
  evidence: EvidenceLink[],
  pid: number,
): string {
  const header = `Evidence ${verb} ${roundName} - ${typeLabel} Milestone ${milestoneIndex + 1} - ${itemLabel} ${itemIndex + 1} (${completion}% Complete)`;
  const lines = evidence.map((e) => `- [${e.name}](${e.link})`);
  return `${header}:\n\n${lines.join("\n")}\n\n[Go to the milestone](/projects/${pid}?tab=milestones&milestone=${milestoneType}-${milestoneIndex})`;
}

function buildTextUpdatePostContent(
  roundName: string,
  milestoneType: string,
  typeLabel: string,
  milestoneIndex: number,
  otherDetails: string,
  pid: number,
): string {
  return `Details updated on ${roundName} - ${typeLabel} Milestone ${milestoneIndex + 1}:\n\n${otherDetails}\n\n[Go to the milestone](/projects/${pid}?tab=milestones&milestone=${milestoneType}-${milestoneIndex})`;
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
    const {
      applicationId,
      milestoneType,
      milestoneIndex,
      progress,
      definition,
    } = body;

    if (
      typeof applicationId !== "number" ||
      !["build", "growth"].includes(milestoneType) ||
      typeof milestoneIndex !== "number"
    ) {
      return Response.json({ success: false, error: "Invalid parameters" });
    }

    const application = await db
      .selectFrom("applications")
      .select([
        "id",
        "projectId",
        "roundId",
        "status",
        "details",
        "editsUnlocked",
      ])
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

    if (definition) {
      if (!application.editsUnlocked) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Edits are not unlocked for this application",
          }),
          { status: 403 },
        );
      }

      const parsedDef = milestoneDefinitionSchema.safeParse(definition);
      if (!parsedDef.success) {
        return Response.json({
          success: false,
          error: parsedDef.error.issues[0].message,
        });
      }

      const appDetails = parseDetails<RoundForm>(application.details);
      if (!appDetails) {
        return Response.json({
          success: false,
          error: "Failed to parse application details",
        });
      }

      const milestonesArray =
        milestoneType === "build"
          ? appDetails.buildGoals?.milestones
          : appDetails.growthGoals?.milestones;

      if (!milestonesArray || milestoneIndex >= milestonesArray.length) {
        return Response.json({
          success: false,
          error: "Milestone index out of range",
        });
      }

      if (milestoneType === "build") {
        appDetails.buildGoals.milestones[milestoneIndex] = {
          title: parsedDef.data.title,
          description: parsedDef.data.description,
          deliverables: parsedDef.data.items,
        };
      } else {
        appDetails.growthGoals.milestones[milestoneIndex] = {
          title: parsedDef.data.title,
          description: parsedDef.data.description,
          activations: parsedDef.data.items,
        };
      }

      await db
        .updateTable("applications")
        .set({
          details: JSON.stringify(appDetails),
          updatedAt: new Date(),
        })
        .where("id", "=", applicationId)
        .execute();

      return Response.json({ success: true });
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
    const itemLabel = MILESTONE_ITEM_LABELS[milestoneType] ?? "Deliverable";

    for (let i = 0; i < newProgress.items.length; i++) {
      const newItem = newProgress.items[i];
      const oldItem = oldProgress?.items?.[i];
      const oldEvidence = oldItem?.evidence ?? [];

      const hasNewEntries = newItem.evidence.length > oldEvidence.length;
      const minLen = Math.min(oldEvidence.length, newItem.evidence.length);
      let hasEdits = oldEvidence.length > newItem.evidence.length;
      for (let j = 0; j < minLen && !hasEdits; j++) {
        if (
          oldEvidence[j].name !== newItem.evidence[j].name ||
          oldEvidence[j].link !== newItem.evidence[j].link
        ) {
          hasEdits = true;
        }
      }

      if (!hasNewEntries && !hasEdits) continue;

      const verb = hasEdits ? "updated on" : "added to";
      const evidenceToShow = hasEdits
        ? newItem.evidence
        : newItem.evidence.slice(oldEvidence.length);

      if (evidenceToShow.length > 0) {
        feedMessages.push(
          buildEvidencePostContent(
            verb,
            roundName,
            milestoneType,
            typeLabel,
            milestoneIndex,
            i,
            itemLabel,
            newItem.completion,
            evidenceToShow,
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
          milestoneType,
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
          applicationId: null as number | null,
          authorAddress: MILESTONE_AUTHOR_ADDRESS,
          messageType: "milestone_update",
          content,
          createdAt: now,
          updatedAt: now,
        },
        {
          channelType: "PUBLIC_ROUND" as const,
          projectId: pid,
          roundId: application.roundId,
          applicationId: null as number | null,
          authorAddress: MILESTONE_AUTHOR_ADDRESS,
          messageType: "milestone_update",
          content,
          createdAt: now,
          updatedAt: now,
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
