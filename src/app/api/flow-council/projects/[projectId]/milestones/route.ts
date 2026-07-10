import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { db } from "@/app/api/flow-council/db";
import { isProjectManager } from "@/app/api/flow-council/auth";
import { parseDetails } from "@/app/api/flow-council/utils";
import {
  milestoneProgressSchema,
  pickMilestoneDefinitionSchema,
  getStoredMilestoneDescription,
  MAX_STRING_LENGTH,
} from "@/app/api/flow-council/validation";
import {
  lockApplicationDetails,
  MilestoneSourcesConflictError,
  remapMilestoneProgress,
} from "@/app/api/flow-council/milestoneSources";
import {
  CHARACTER_LIMITS,
  MAX_MILESTONES,
} from "@/app/flow-councils/constants";
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

// Graduated grantees are still active recipients (see the recipients route and
// the review unlock route, which both treat GRADUATED like ACCEPTED), so their
// milestones stay visible and editable.
const ACTIVE_GRANTEE_STATUSES = ["ACCEPTED", "GRADUATED"] as const;

// Legacy applications have no per-element minCount; the Round tab UI never
// lets the list go empty, so deletes stop at one milestone per type.
const LEGACY_MIN_MILESTONES = 1;

// Same clamp as DynamicMilestoneInput and the form-builder schema (1-5).
function clampMinCount(minCount: number | undefined): number {
  return Math.max(1, Math.min(5, minCount ?? 1));
}

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
      .where("applications.status", "in", ACTIVE_GRANTEE_STATUSES)
      .orderBy("applications.roundId", "desc")
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
          const descriptionMinChars = element.descriptionMinChars ?? 0;
          const descriptionMaxChars =
            element.descriptionMaxChars ?? MAX_STRING_LENGTH;
          const minCount = clampMinCount(element.minCount);
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
              descriptionMinChars,
              descriptionMaxChars,
              minCount,
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
              descriptionMinChars: CHARACTER_LIMITS.milestoneDescription.min,
              descriptionMaxChars: CHARACTER_LIMITS.milestoneDescription.max,
              minCount: LEGACY_MIN_MILESTONES,
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
              descriptionMinChars: CHARACTER_LIMITS.milestoneDescription.min,
              descriptionMaxChars: CHARACTER_LIMITS.milestoneDescription.max,
              minCount: LEGACY_MIN_MILESTONES,
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

// Deep links carry the applicationId so the anchor stays unique when a
// project has milestones in more than one round (legacy rounds share the
// "build"/"growth" types, so type+index alone collides across rounds).
function buildEvidencePostContent(
  verb: "added to" | "updated on",
  roundName: string,
  applicationId: number,
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
  return `${header}:\n\n${lines.join("\n")}\n\n[Go to the milestone](/projects/${pid}?tab=milestones&milestone=${applicationId}-${milestoneType}-${milestoneIndex})`;
}

function buildTextUpdatePostContent(
  roundName: string,
  applicationId: number,
  milestoneType: string,
  typeLabel: string,
  milestoneIndex: number,
  otherDetails: string,
  pid: number,
): string {
  return `Details updated on ${roundName} - ${typeLabel} ${milestoneIndex + 1}:\n\n${otherDetails}\n\n[Go to the milestone](/projects/${pid}?tab=milestones&milestone=${applicationId}-${milestoneType}-${milestoneIndex})`;
}

type AuthorizedMilestoneWrite = {
  pid: number;
  applicationId: number;
  milestoneType: string;
  application: {
    id: number;
    projectId: number;
    roundId: number;
    status: string;
    details: unknown;
    editsUnlocked: boolean | null;
  };
  appDetailsParsed: (RoundForm & DynamicAppDetails) | null;
  isDynamic: boolean;
  roundDetailsParsed: { name?: string; formSchema?: FormSchema } | null;
  dynamicMilestoneElement: MilestoneQuestion | undefined;
};

// Shared gate for every milestone write (PATCH edit, POST add, DELETE remove):
// the caller must be an authenticated manager of the project and the
// application an active grantee's in that project. For dynamic apps,
// milestoneType is used as an object-key lookup against appDetails.round, so
// it must match a milestone element declared in the round's formSchema — a
// manager cannot probe or overwrite arbitrary keys in the stored application
// JSON (e.g. __proto__, unrelated fields).
async function authorizeMilestoneWrite(
  projectId: string,
  body: { applicationId?: unknown; milestoneType?: unknown },
): Promise<{ response: Response } | AuthorizedMilestoneWrite> {
  if (!projectId || isNaN(Number(projectId))) {
    return {
      response: Response.json({ success: false, error: "Invalid project ID" }),
    };
  }

  const pid = Number(projectId);

  const session = await getServerSession(authOptions);
  if (!session?.address) {
    return {
      response: new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        { status: 401 },
      ),
    };
  }

  const hasAccess = await isProjectManager(pid, session.address);
  if (!hasAccess) {
    return {
      response: new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
        { status: 403 },
      ),
    };
  }

  const { applicationId, milestoneType } = body;

  if (
    typeof applicationId !== "number" ||
    typeof milestoneType !== "string" ||
    milestoneType.length === 0 ||
    milestoneType.length > 100
  ) {
    return {
      response: Response.json({ success: false, error: "Invalid parameters" }),
    };
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
    .where("status", "in", ACTIVE_GRANTEE_STATUSES)
    .executeTakeFirst();

  if (!application) {
    return {
      response: Response.json({
        success: false,
        error: "Application not found or not accepted",
      }),
    };
  }

  // Graduated grants are a concluded record: visible on the tab, but any
  // write (progress or definition) requires the admin to unlock edits.
  if (application.status === "GRADUATED" && !application.editsUnlocked) {
    return { response: editsLockedResponse() };
  }

  const appDetailsParsed = parseDetails<RoundForm & DynamicAppDetails>(
    application.details,
  );
  const isDynamic = isDynamicAppDetails(appDetailsParsed);

  if (!isDynamic && !["build", "growth"].includes(milestoneType)) {
    return {
      response: Response.json({ success: false, error: "Invalid parameters" }),
    };
  }

  const roundRow = await db
    .selectFrom("rounds")
    .select("details")
    .where("id", "=", application.roundId)
    .executeTakeFirst();
  const roundDetailsParsed = parseDetails<{
    name?: string;
    formSchema?: FormSchema;
  }>(roundRow?.details);

  let dynamicMilestoneElement: MilestoneQuestion | undefined;
  if (isDynamic) {
    dynamicMilestoneElement = getMilestoneElements(
      roundDetailsParsed?.formSchema,
    ).find((el) => el.id === milestoneType);
    if (!dynamicMilestoneElement) {
      return {
        response: Response.json({
          success: false,
          error: "Invalid parameters",
        }),
      };
    }
  }

  return {
    pid,
    applicationId,
    milestoneType,
    application,
    appDetailsParsed,
    isDynamic,
    roundDetailsParsed,
    dynamicMilestoneElement,
  };
}

function editsLockedResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Edits are not unlocked for this application",
    }),
    { status: 403 },
  );
}

function savingConflictResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error:
        "This application changed while you were saving. Reload and try again.",
    }),
    { status: 409 },
  );
}

// The stored milestone array a write targets, read against the given details
// (for adds and deletes, the ones re-read under the row lock). Null when the
// details do not carry it.
function getMilestonesArray(
  details: unknown,
  isDynamic: boolean,
  milestoneType: string,
): unknown[] | null {
  const parsed = details as (RoundForm & DynamicAppDetails) | null | undefined;
  const value = isDynamic
    ? parsed?.round?.[milestoneType]
    : milestoneType === "build"
      ? parsed?.buildGoals?.milestones
      : parsed?.growthGoals?.milestones;
  return Array.isArray(value) ? value : null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const auth = await authorizeMilestoneWrite(projectId, body);
    if ("response" in auth) return auth.response;

    const {
      pid,
      applicationId,
      milestoneType,
      application,
      appDetailsParsed,
      isDynamic,
      roundDetailsParsed,
      dynamicMilestoneElement,
    } = auth;
    const { milestoneIndex, progress, definition } = body;

    if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) {
      return Response.json({ success: false, error: "Invalid parameters" });
    }

    if (definition) {
      if (!application.editsUnlocked) {
        return editsLockedResponse();
      }

      const storedMilestones = isDynamic
        ? (appDetailsParsed as { round?: Record<string, unknown> }).round?.[
            milestoneType
          ]
        : milestoneType === "build"
          ? (appDetailsParsed as RoundForm)?.buildGoals?.milestones
          : (appDetailsParsed as RoundForm)?.growthGoals?.milestones;
      const storedDescription = getStoredMilestoneDescription(
        storedMilestones,
        milestoneIndex,
      );
      const descriptionUnchanged =
        storedDescription !== undefined &&
        (definition as { description?: unknown })?.description ===
          storedDescription;

      // Descriptions are mandatory, enforced as a ratchet: an unchanged stored
      // description (e.g. an empty one left by the round-49 backfill) never
      // blocks saving the rest of the definition, but any edited description
      // must be non-empty and honor the per-element descriptionMin/MaxChars
      // from the round's formSchema (legacy apps use the 500-5000 bounds).
      const definitionSchema = pickMilestoneDefinitionSchema(
        dynamicMilestoneElement,
        descriptionUnchanged,
      );
      const parsedDef = definitionSchema.safeParse(definition);
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

    const roundName = roundDetailsParsed?.name ?? "Round";
    const { milestoneLabel: typeLabel, itemLabel } = getMilestoneLabels(
      milestoneType,
      roundDetailsParsed?.formSchema,
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
            applicationId,
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
          applicationId,
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

// Appends a milestone to an unlocked application. The array is re-read under a
// row lock so a racing save cannot be clobbered; appending never moves an
// existing milestone, so no progress remap is needed.
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const auth = await authorizeMilestoneWrite(projectId, body);
    if ("response" in auth) return auth.response;

    const {
      applicationId,
      milestoneType,
      application,
      isDynamic,
      dynamicMilestoneElement,
    } = auth;

    if (!application.editsUnlocked) {
      return editsLockedResponse();
    }

    // New milestones have no stored counterpart, so the description ratchet
    // does not apply: everything validates strictly against the element's
    // bounds (or the legacy bounds).
    const definitionSchema = pickMilestoneDefinitionSchema(
      dynamicMilestoneElement,
      false,
    );
    const parsedDef = definitionSchema.safeParse(body.definition);
    if (!parsedDef.success) {
      return Response.json({
        success: false,
        error: parsedDef.error.issues[0].message,
      });
    }

    const newMilestone = isDynamic
      ? {
          title: parsedDef.data.title,
          description: parsedDef.data.description,
          items: parsedDef.data.items,
        }
      : milestoneType === "build"
        ? {
            title: parsedDef.data.title,
            description: parsedDef.data.description,
            deliverables: parsedDef.data.items,
          }
        : {
            title: parsedDef.data.title,
            description: parsedDef.data.description,
            activations: parsedDef.data.items,
          };

    let failure: string | null = null;

    await db.transaction().execute(async (trx) => {
      const lockedDetails = await lockApplicationDetails(trx, applicationId);
      const milestonesArray = getMilestonesArray(
        lockedDetails,
        isDynamic,
        milestoneType,
      );

      if (!milestonesArray) {
        failure = "Milestones not found";
        return;
      }
      if (milestonesArray.length >= MAX_MILESTONES) {
        failure = `At most ${MAX_MILESTONES} milestones are allowed`;
        return;
      }

      milestonesArray.push(newMilestone);

      await trx
        .updateTable("applications")
        .set({
          details: JSON.stringify(lockedDetails),
          updatedAt: new Date(),
        })
        .where("id", "=", applicationId)
        .execute();
    });

    if (failure) {
      return Response.json({ success: false, error: failure });
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof MilestoneSourcesConflictError) {
      return savingConflictResponse();
    }
    console.error("Failed to add milestone:", err);
    return Response.json({
      success: false,
      error: "Failed to add milestone",
    });
  }
}

// Removes a milestone from an unlocked application. Runs under the same row
// lock as POST, and remaps milestone_progress in the same transaction so the
// deleted milestone's reported progress is dropped and every later milestone
// keeps its own.
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const auth = await authorizeMilestoneWrite(projectId, body);
    if ("response" in auth) return auth.response;

    const {
      applicationId,
      milestoneType,
      application,
      isDynamic,
      dynamicMilestoneElement,
    } = auth;
    const { milestoneIndex } = body;

    if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) {
      return Response.json({ success: false, error: "Invalid parameters" });
    }

    if (!application.editsUnlocked) {
      return editsLockedResponse();
    }

    const minCount = isDynamic
      ? clampMinCount(dynamicMilestoneElement?.minCount)
      : LEGACY_MIN_MILESTONES;

    let failure: string | null = null;

    await db.transaction().execute(async (trx) => {
      const lockedDetails = await lockApplicationDetails(trx, applicationId);
      const milestonesArray = getMilestonesArray(
        lockedDetails,
        isDynamic,
        milestoneType,
      );

      if (!milestonesArray || milestoneIndex >= milestonesArray.length) {
        failure = "Milestone index out of range";
        return;
      }
      if (milestonesArray.length <= minCount) {
        failure = `At least ${minCount} milestone${minCount === 1 ? " is" : "s are"} required`;
        return;
      }

      const storedCount = milestonesArray.length;
      milestonesArray.splice(milestoneIndex, 1);

      await trx
        .updateTable("applications")
        .set({
          details: JSON.stringify(lockedDetails),
          updatedAt: new Date(),
        })
        .where("id", "=", applicationId)
        .execute();

      const remainingSources = Array.from(
        { length: storedCount },
        (_, i) => i,
      ).filter((i) => i !== milestoneIndex);

      await remapMilestoneProgress(
        trx,
        applicationId,
        { [milestoneType]: remainingSources },
        { [milestoneType]: storedCount },
      );
    });

    if (failure) {
      return Response.json({ success: false, error: failure });
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof MilestoneSourcesConflictError) {
      return savingConflictResponse();
    }
    console.error("Failed to delete milestone:", err);
    return Response.json({
      success: false,
      error: "Failed to delete milestone",
    });
  }
}
