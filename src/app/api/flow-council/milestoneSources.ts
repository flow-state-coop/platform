import { sql, type Kysely, type Transaction } from "kysely";
import type { DB } from "@/generated/kysely";
import { MINIMAL_TEMPLATE } from "@/app/flow-councils/types/formSchema";

// Postgres: lock_not_available, i.e. the row lock below hit its timeout.
const LOCK_TIMEOUT_SQLSTATE = "55P03";

const LEGACY_MILESTONE_TYPES = ["build", "growth"];

// The milestone types a save can carry: the round schema's milestone element
// ids for dynamic forms, or the two fixed legacy goal arrays.
export function getMilestoneTypes(
  isDynamicFlow: boolean,
  roundFormSchema: unknown,
): string[] {
  if (!isDynamicFlow) return LEGACY_MILESTONE_TYPES;
  const elements = Array.isArray(roundFormSchema)
    ? (roundFormSchema as { id: string; type: string }[])
    : MINIMAL_TEMPLATE.round;
  return elements
    .filter((element) => element.type === "milestone")
    .map((element) => element.id);
}

// Counts the milestones stored under each type, skipping types the details do
// not carry, so `milestoneSources` can only ever name a milestone array that
// actually exists on both sides of the save.
export function getMilestoneCounts(
  details: unknown,
  isDynamicFlow: boolean,
  types: string[],
): Record<string, number> {
  const parsed = details as
    | {
        round?: Record<string, unknown>;
        buildGoals?: { milestones?: unknown };
        growthGoals?: { milestones?: unknown };
      }
    | undefined
    | null;
  const counts: Record<string, number> = {};

  for (const type of types) {
    const value = isDynamicFlow
      ? parsed?.round?.[type]
      : type === "build"
        ? parsed?.buildGoals?.milestones
        : parsed?.growthGoals?.milestones;
    if (Array.isArray(value)) counts[type] = value.length;
  }

  return counts;
}

// Reported progress lives in `milestone_progress`, keyed by the milestone's
// position in the application's milestone array. Once a grantee can add and
// remove milestones on an accepted application, those positions move, so a save
// carries a `milestoneSources` map: for each milestone type, the index each
// submitted milestone occupied in the stored array, or null when it is new.
// Without it a deletion would silently hand a milestone's completion and
// evidence to whichever milestone slid into its slot.
export type MilestoneSources = Record<string, (number | null)[]>;

// Thrown when the stored milestones changed between the request reading them
// and the transaction that rewrites them (a double-submitted save, two tabs).
// The provenance the caller sent describes an array that no longer exists, so
// applying it would move progress onto the wrong milestone or drop it.
export class MilestoneSourcesConflictError extends Error {
  constructor() {
    super("Application changed while saving");
    this.name = "MilestoneSourcesConflictError";
  }
}

type ParseResult =
  | { success: true; sources: MilestoneSources }
  | { success: false; error: string };

export function parseMilestoneSources(
  raw: unknown,
  storedCounts: Record<string, number>,
  submittedCounts: Record<string, number>,
): ParseResult {
  if (raw === undefined || raw === null) return { success: true, sources: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { success: false, error: "Invalid milestone sources" };
  }

  const sources: MilestoneSources = {};

  for (const [type, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(submittedCounts, type)) {
      return { success: false, error: "Invalid milestone sources" };
    }
    if (!Array.isArray(value) || value.length !== submittedCounts[type]) {
      return { success: false, error: "Invalid milestone sources" };
    }

    const storedCount = storedCounts[type] ?? 0;
    const seen = new Set<number>();
    const entries: (number | null)[] = [];

    for (const entry of value) {
      if (entry === null) {
        entries.push(null);
        continue;
      }
      if (
        !Number.isInteger(entry) ||
        (entry as number) < 0 ||
        (entry as number) >= storedCount ||
        seen.has(entry as number)
      ) {
        return { success: false, error: "Invalid milestone sources" };
      }
      seen.add(entry as number);
      entries.push(entry as number);
    }

    sources[type] = entries;
  }

  return { success: true, sources };
}

// Locks the application row and returns its current details, so a
// read-modify-write of the milestone arrays cannot race another save.
//
// The wait is bounded: connections reach Postgres through a transaction pooler,
// where a lock wait pins a server connection for its whole duration. Giving up
// quickly turns a contended save into a retryable conflict instead of letting
// it hold the pool while it waits.
export async function lockApplicationDetails(
  trx: Transaction<DB>,
  applicationId: number,
): Promise<unknown> {
  await sql`set local lock_timeout = '3s'`.execute(trx);

  let current;
  try {
    current = await trx
      .selectFrom("applications")
      .select("details")
      .where("id", "=", applicationId)
      .forUpdate()
      .executeTakeFirstOrThrow();
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === LOCK_TIMEOUT_SQLSTATE
    ) {
      throw new MilestoneSourcesConflictError();
    }
    throw err;
  }

  return typeof current.details === "string"
    ? JSON.parse(current.details)
    : current.details;
}

// Re-reads the milestones under a row lock and re-checks the caller's
// provenance against them, so a save that raced another one is rejected
// instead of remapping progress against counts that have since moved. Returns
// the counts the remap must use.
export async function lockAndRevalidateMilestoneSources(
  trx: Transaction<DB>,
  applicationId: number,
  rawMilestoneSources: unknown,
  isDynamicFlow: boolean,
  milestoneTypes: string[],
  submittedCounts: Record<string, number>,
): Promise<{
  sources: MilestoneSources;
  storedCounts: Record<string, number>;
}> {
  const details = await lockApplicationDetails(trx, applicationId);

  const storedCounts = getMilestoneCounts(
    details,
    isDynamicFlow,
    milestoneTypes,
  );

  const parsed = parseMilestoneSources(
    rawMilestoneSources,
    storedCounts,
    submittedCounts,
  );
  if (!parsed.success) throw new MilestoneSourcesConflictError();

  return { sources: parsed.sources, storedCounts };
}

function isIdentity(entries: (number | null)[], storedCount: number): boolean {
  return (
    entries.length === storedCount &&
    entries.every((entry, index) => entry === index)
  );
}

// Rewrites each type's progress rows in one delete-then-insert pass. The table's
// unique index on (application_id, milestone_type, milestone_index) makes an
// in-place UPDATE collide whenever two milestones swap or shift into each
// other's slots, so the rows are cleared first inside the caller's transaction.
export async function remapMilestoneProgress(
  trx: Transaction<DB> | Kysely<DB>,
  applicationId: number,
  sources: MilestoneSources,
  storedCounts: Record<string, number>,
): Promise<void> {
  const types = Object.keys(sources).filter(
    (type) => !isIdentity(sources[type], storedCounts[type] ?? 0),
  );
  if (types.length === 0) return;

  const rows = await trx
    .selectFrom("milestoneProgress")
    .select(["milestoneType", "milestoneIndex", "progress"])
    .where("applicationId", "=", applicationId)
    .where("milestoneType", "in", types)
    .execute();

  if (rows.length === 0) return;

  const byType = new Map<string, Map<number, unknown>>();
  for (const row of rows) {
    const forType = byType.get(row.milestoneType) ?? new Map();
    forType.set(row.milestoneIndex, row.progress);
    byType.set(row.milestoneType, forType);
  }

  await trx
    .deleteFrom("milestoneProgress")
    .where("applicationId", "=", applicationId)
    .where("milestoneType", "in", types)
    .execute();

  const inserts = types.flatMap((type) => {
    const forType = byType.get(type);
    if (!forType) return [];
    return sources[type].flatMap((sourceIndex, newIndex) => {
      if (sourceIndex === null) return [];
      const progress = forType.get(sourceIndex);
      if (progress === undefined) return [];
      return [
        {
          applicationId,
          milestoneType: type,
          milestoneIndex: newIndex,
          progress:
            progress === null || typeof progress === "string"
              ? progress
              : JSON.stringify(progress),
        },
      ];
    });
  });

  if (inserts.length > 0) {
    await trx.insertInto("milestoneProgress").values(inserts).execute();
  }
}
