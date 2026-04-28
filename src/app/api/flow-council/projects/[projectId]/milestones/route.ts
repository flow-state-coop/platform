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
  FormSchema,
  MilestoneQuestion,
} from "@/app/flow-councils/types/formSchema";
import type { DynamicMilestoneValue } from "@/app/flow-councils/components/DynamicMilestoneInput";
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

type DynamicAppDetails = {
  round?: Record<string, unknown>;
  attestation?: Record<string, unknown>;
};

// Dynamic apps store answers under appDetails.round[elementId].
// Legacy apps use top-level buildGoals/growthGoals; absence of a 'round'
// key is the discriminant.
function isDynamicAppDetails(appDetails: unknown): appDetails is {
  round: Record<string, unknown>;
} {
  return (
    !!appDetails &&
    typeof appDetails === "object" &&
    "round" in (appDetails as object) &&
    typeof (appDetails as DynamicAppDetails).round === "object" &&
    (appDetails as DynamicAppDetails).round !== null
  );
}

function getMilestoneElements(
  formSchema: FormSchema | null | undefined,
): MilestoneQuestion[] {
  if (!formSchema?.round) return [];
  return formSchema.round.filter(
    (el): el is MilestoneQuestion => el.type === "milestone",
  );
}

function resolveDynamicLabels(
  formSchema: FormSchema | null | undefined,
  elementId: string,
): { milestoneLabel: string; itemLabel: string } {
  const element = getMilestoneElements(formSchema).find(
    (el) => el.id === elementId,
  );
  return {
    milestoneLabel: element?.milestoneLabel || element?.label || "Milestone",
    itemLabel: element?.itemLabel || "Deliverable",
  };
}

const LEGACY_MILESTONE_LABELS: Record<string, string> = {
  build: "Build Milestone",
  growth: "Growth Milestone",
};

const LEGACY_ITEM_LABELS: Record<string, string> = {
  build: "Deliverable",
  growth: "Activation",
};

function getMilestoneLabels(
  milestoneType: string,
  formSchema: FormSchema | null | undefined,
  isDynamic: boolean,
): { milestoneLabel: string; itemLabel: string } {
  if (isDynamic) {
    return resolveDynamicLabels(formSchema, milestoneType);
  }
  return {
    milestoneLabel: LEGACY_MILESTONE_LABELS[milestoneType] ?? milestoneType,
    itemLabel: LEGACY_ITEM_LABELS[milestoneType] ?? "Deliverable",
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
      const roundDetails = parseDetails<{
        name?: string;
        formSchema?: FormSchema;
      }>(app.roundDetails);
      const appDetailsRaw = parseDetails<RoundForm & DynamicAppDetails>(
        app.appDetails,
      );
      const milestones: MilestoneWithProgress[] = [];

      if (isDynamicAppDetails(appDetailsRaw)) {
        const milestoneElements = getMilestoneElements(
          roundDetails?.formSchema,
        );
        for (const element of milestoneElements) {
          const raw = appDetailsRaw.round[element.id];
          if (!Array.isArray(raw)) continue;
          const milestoneLabel =
            element.milestoneLabel || element.label || "Milestone";
          const itemLabel = element.itemLabel || "Deliverable";
          (raw as DynamicMilestoneValue[]).forEach((m, i) => {
            if (!m || typeof m !== "object") return;
            const items = Array.isArray(m.items) ? m.items : [];
            const key = `${app.applicationId}-${element.id}-${i}`;
            milestones.push({
              type: element.id,
              milestoneLabel,
              itemLabel,
              index: i,
              title: typeof m.title === "string" ? m.title : "",
              description:
                typeof m.description === "string" ? m.description : "",
              itemNames: items,
              progress: progressMap.get(key) ?? emptyProgress(items.length),
            });
          });
        }
      } else {
        if (appDetailsRaw?.buildGoals?.milestones) {
          appDetailsRaw.buildGoals.milestones.forEach((m, i) => {
            const key = `${app.applicationId}-build-${i}`;
            milestones.push({
              type: "build",
              milestoneLabel: "Build Milestone",
              itemLabel: "Deliverable",
              index: i,
              title: m.title,
              description: m.description,
              itemNames: m.deliverables,
              progress:
                progressMap.get(key) ?? emptyProgress(m.deliverables.length),
            });
          });
        }

        if (appDetailsRaw?.growthGoals?.milestones) {
          appDetailsRaw.growthGoals.milestones.forEach((m, i) => {
            const key = `${app.applicationId}-growth-${i}`;
            milestones.push({
              type: "growth",
              milestoneLabel: "Growth Milestone",
              itemLabel: "Activation",
              index: i,
              title: m.title,
              description: m.description,
              itemNames: m.activations,
              progress:
                progressMap.get(key) ?? emptyProgress(m.activations.length),
            });
          });
        }
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
  const header = `Evidence ${verb} ${roundName} - ${typeLabel} ${milestoneIndex + 1} - ${itemLabel} ${itemIndex + 1} (${completion}% Complete)`;
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
  return `Details updated on ${roundName} - ${typeLabel} ${milestoneIndex + 1}:\n\n${otherDetails}\n\n[Go to the milestone](/projects/${pid}?tab=milestones&milestone=${milestoneType}-${milestoneIndex})`;
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
      typeof milestoneType !== "string" ||
      milestoneType.length === 0 ||
      milestoneType.length > 100 ||
      !Number.isInteger(milestoneIndex) ||
      milestoneIndex < 0
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

    const appDetailsParsed = parseDetails<RoundForm & DynamicAppDetails>(
      application.details,
    );
    const isDynamic = isDynamicAppDetails(appDetailsParsed);

    if (!isDynamic && !["build", "growth"].includes(milestoneType)) {
      return Response.json({ success: false, error: "Invalid parameters" });
    }

    // For dynamic apps, milestoneType is used as an object-key lookup against
    // appDetails.round. Verify it matches a milestone element declared in the
    // round's formSchema so a manager cannot probe or overwrite arbitrary keys
    // in the stored application JSON (e.g. __proto__, unrelated fields).
    let dynamicMilestoneElement: MilestoneQuestion | undefined;
    if (isDynamic) {
      const roundForLookup = await db
        .selectFrom("rounds")
        .select("details")
        .where("id", "=", application.roundId)
        .executeTakeFirst();
      const roundDetailsForLookup = parseDetails<{
        formSchema?: FormSchema;
      }>(roundForLookup?.details);
      dynamicMilestoneElement = getMilestoneElements(
        roundDetailsForLookup?.formSchema,
      ).find((el) => el.id === milestoneType);
      if (!dynamicMilestoneElement) {
        return Response.json({ success: false, error: "Invalid parameters" });
      }
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

      if (!appDetailsParsed) {
        return Response.json({
          success: false,
          error: "Failed to parse application details",
        });
      }

      if (isDynamic) {
        const dynamicAppDetails = appDetailsParsed as DynamicAppDetails & {
          round: Record<string, unknown>;
        };
        const milestonesArray = dynamicAppDetails.round[milestoneType];
        if (
          !Array.isArray(milestonesArray) ||
          milestoneIndex >= milestonesArray.length
        ) {
          return Response.json({
            success: false,
            error: "Milestone index out of range",
          });
        }
        const updated: DynamicMilestoneValue = {
          title: parsedDef.data.title,
          description: parsedDef.data.description,
          items: parsedDef.data.items,
        };
        (milestonesArray as DynamicMilestoneValue[])[milestoneIndex] = updated;

        await db
          .updateTable("applications")
          .set({
            details: JSON.stringify(dynamicAppDetails),
            updatedAt: new Date(),
          })
          .where("id", "=", applicationId)
          .execute();

        return Response.json({ success: true });
      }

      const appDetails = appDetailsParsed as RoundForm;
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

    const roundDetails = parseDetails<{
      name?: string;
      formSchema?: FormSchema;
    }>(roundData?.details);
    const roundName = roundDetails?.name ?? "Round";
    const { milestoneLabel: typeLabel, itemLabel } = getMilestoneLabels(
      milestoneType,
      roundDetails?.formSchema,
      isDynamic,
    );

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
