/**
 * Normalize stored human-facing names and titles. Rows written before the
 * schemas normalized them can carry stray whitespace or invisible characters,
 * which break exact-match lookups for API consumers.
 *
 * Deliberately gentler than the write path: it trims and strips invisibles but
 * never collapses internal whitespace. Production holds team-contact names and
 * milestone titles that people pasted whole markdown documents into, and
 * reflowing those would rewrite their content for no consumer benefit. New
 * writes still get the full single-line treatment from nameSchema.
 *
 * The dry run also reports any row whose name already exceeds the write-path
 * length cap, since that row's owner cannot re-save it until someone shortens
 * it.
 *
 * Run:         pnpm tsx scripts/normalize-names.ts
 * Dry run:     DRY_RUN=1 pnpm tsx scripts/normalize-names.ts
 *
 * Supersedes scripts/trim-project-names.ts, which only trimmed and only covered
 * projects.details.name.
 */
import { db } from "../src/app/api/flow-council/db";
import {
  normalizeName,
  stripInvisibleCharacters,
} from "../src/lib/normalizeName";

const DRY_RUN = process.env.DRY_RUN === "1";

type Json = Record<string, unknown>;

// An empty details column is an ordinary draft row, not a data problem, so it
// stays quiet; anything else that fails to read is worth a line.
function parse(value: unknown, label: string): Json | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object") return parsed as Json;
    console.log(`SKIP ${label}: details is not an object`);
    return null;
  } catch {
    console.log(`SKIP ${label}: corrupt details JSON`);
    return null;
  }
}

let changed = 0;
let skippedEmpty = 0;
let overCap = 0;

type FieldOptions = {
  // The write-path length limit for this field, checked against what the write
  // path (normalizeName) would produce rather than the gentler value this
  // script stores: a row already over the limit can't be re-saved by its owner.
  max: number;
  normalize?: (value: string) => string;
};

/**
 * Normalize one string field in place. A value that normalizes to nothing is
 * left alone: there is no correct replacement, and blanking it would fail the
 * schema's minimum on the owner's next save.
 */
function normalizeField(
  holder: Json,
  key: string,
  label: string,
  options: FieldOptions,
): boolean {
  const value = holder[key];
  if (typeof value !== "string") return false;

  const writePathLength = normalizeName(value).length;
  if (writePathLength > options.max) {
    console.log(
      `OVER CAP ${label}: ${writePathLength} chars against a ${options.max} limit; the owner's next save will fail validation`,
    );
    overCap++;
  }

  const next = (options.normalize ?? stripInvisibleCharacters)(value);
  if (next === value) return false;

  if (next.length === 0) {
    console.log(
      `SKIP ${label}: normalizes to empty (${JSON.stringify(value)})`,
    );
    skippedEmpty++;
    return false;
  }

  console.log(
    `${DRY_RUN ? "[DRY] " : ""}${label}: ${JSON.stringify(value)} -> ${JSON.stringify(next)}`,
  );
  holder[key] = next;
  changed++;
  return true;
}

function normalizeArray(
  holder: Json,
  key: string,
  field: string,
  label: string,
  options: FieldOptions,
): boolean {
  const list = holder[key];
  if (!Array.isArray(list)) return false;

  let touched = false;
  list.forEach((entry, i) => {
    if (entry && typeof entry === "object") {
      touched =
        normalizeField(
          entry as Json,
          field,
          `${label}[${i}].${field}`,
          options,
        ) || touched;
    }
  });
  return touched;
}

// Mirrors the write-path caps in src/app/api/flow-council/validation.ts.
const CAPS = {
  projectName: 200,
  roundName: 200,
  socialAccountName: 50,
  voterGroupName: 100,
  teamMemberName: 10_000,
  legacyMilestoneTitle: 10_000,
  dynamicMilestoneTitle: 200,
};

async function normalizeProjects() {
  const rows = await db
    .selectFrom("projects")
    .select(["id", "details"])
    .execute();

  for (const row of rows) {
    const label = `project ${row.id}`;
    const details = parse(row.details, label);
    if (!details) continue;

    let touched = normalizeField(details, "name", `${label}.name`, {
      max: CAPS.projectName,
    });

    const social = details.social;
    if (social && typeof social === "object") {
      touched =
        normalizeArray(social as Json, "accounts", "name", `${label}.social`, {
          max: CAPS.socialAccountName,
        }) || touched;
    }

    if (touched && !DRY_RUN) {
      await db
        .updateTable("projects")
        .set({ details: JSON.stringify(details) })
        .where("id", "=", row.id)
        .execute();
    }
  }
}

async function normalizeApplications() {
  const rows = await db
    .selectFrom("applications")
    .select(["id", "details"])
    .execute();

  for (const row of rows) {
    const label = `application ${row.id}`;
    const details = parse(row.details, label);
    if (!details) continue;

    let touched = false;

    for (const goals of ["buildGoals", "growthGoals"]) {
      const section = details[goals];
      if (section && typeof section === "object") {
        touched =
          normalizeArray(
            section as Json,
            "milestones",
            "title",
            `${label}.${goals}.milestones`,
            { max: CAPS.legacyMilestoneTitle },
          ) || touched;
      }
    }

    // Dynamic rounds keep their answers under details.round / details.attestation
    // keyed by form element id. Only milestone elements hold arrays of objects
    // with a title, so a title is the one field to normalize here; everything
    // else in those arrays is a plain string.
    for (const section of ["round", "attestation"]) {
      const values = details[section];
      if (!values || typeof values !== "object") continue;

      for (const elementId of Object.keys(values as Json)) {
        touched =
          normalizeArray(
            values as Json,
            elementId,
            "title",
            `${label}.${section}.${elementId}`,
            { max: CAPS.dynamicMilestoneTitle },
          ) || touched;
      }
    }

    const team = details.team;
    if (team && typeof team === "object") {
      const primary = (team as Json).primaryContact;
      if (primary && typeof primary === "object") {
        touched =
          normalizeField(
            primary as Json,
            "name",
            `${label}.team.primaryContact.name`,
            { max: CAPS.teamMemberName },
          ) || touched;
      }
      touched =
        normalizeArray(
          team as Json,
          "additionalTeammates",
          "name",
          `${label}.team.additionalTeammates`,
          { max: CAPS.teamMemberName },
        ) || touched;
    }

    if (touched && !DRY_RUN) {
      await db
        .updateTable("applications")
        .set({ details: JSON.stringify(details) })
        .where("id", "=", row.id)
        .execute();
    }
  }
}

async function normalizeRounds() {
  const rows = await db
    .selectFrom("rounds")
    .select(["id", "details"])
    .execute();

  for (const row of rows) {
    const label = `round ${row.id}`;
    const details = parse(row.details, label);
    if (!details) continue;

    let touched = normalizeField(details, "name", `${label}.name`, {
      max: CAPS.roundName,
    });

    const social = details.social;
    if (social && typeof social === "object") {
      touched =
        normalizeArray(social as Json, "accounts", "name", `${label}.social`, {
          max: CAPS.socialAccountName,
        }) || touched;
    }

    if (touched && !DRY_RUN) {
      await db
        .updateTable("rounds")
        .set({ details: JSON.stringify(details) })
        .where("id", "=", row.id)
        .execute();
    }
  }
}

async function normalizeVoterGroups() {
  const rows = await db
    .selectFrom("voterGroups")
    .select(["id", "name"])
    .execute();

  for (const row of rows) {
    const holder: Json = { name: row.name };
    const touched = normalizeField(
      holder,
      "name",
      `voterGroup ${row.id}.name`,
      {
        max: CAPS.voterGroupName,
      },
    );
    if (!touched) continue;

    if (!DRY_RUN) {
      await db
        .updateTable("voterGroups")
        .set({ name: holder.name as string })
        .where("id", "=", row.id)
        .execute();
    }
  }
}

async function main() {
  if (DRY_RUN) console.log("[DRY RUN] No rows will be updated.\n");

  await normalizeProjects();
  await normalizeApplications();
  await normalizeRounds();
  await normalizeVoterGroups();

  console.log(
    `\n${DRY_RUN ? "[DRY RUN] " : ""}Done. ${DRY_RUN ? "Would change" : "Changed"}: ${changed}, skipped (normalize to empty): ${skippedEmpty}, over the write-path cap: ${overCap}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
