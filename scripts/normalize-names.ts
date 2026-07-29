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
 * Run:         pnpm tsx scripts/normalize-names.ts
 * Dry run:     DRY_RUN=1 pnpm tsx scripts/normalize-names.ts
 *
 * Supersedes scripts/trim-project-names.ts, which only trimmed and only covered
 * projects.details.name.
 */
import { db } from "../src/app/api/flow-council/db";
import { stripInvisibleCharacters } from "../src/lib/normalizeName";

const DRY_RUN = process.env.DRY_RUN === "1";

type Json = Record<string, unknown>;

function parse(value: unknown): Json | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? (parsed as Json) : null;
  } catch {
    return null;
  }
}

let changed = 0;
let skippedEmpty = 0;

/**
 * Normalize one string field in place. A value that normalizes to nothing is
 * left alone: there is no correct replacement, and blanking it would fail the
 * schema's minimum on the owner's next save.
 */
function normalizeField(
  holder: Json,
  key: string,
  label: string,
  normalize: (value: string) => string = stripInvisibleCharacters,
): boolean {
  const value = holder[key];
  if (typeof value !== "string") return false;

  const next = normalize(value);
  if (next === value) return false;

  if (next.length === 0) {
    console.log(`SKIP ${label}: normalizes to empty (${JSON.stringify(value)})`);
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
  normalize?: (value: string) => string,
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
          normalize,
        ) || touched;
    }
  });
  return touched;
}

async function normalizeProjects() {
  const rows = await db.selectFrom("projects").select(["id", "details"]).execute();

  for (const row of rows) {
    const details = parse(row.details);
    if (!details) continue;

    const label = `project ${row.id}`;
    let touched = normalizeField(details, "name", `${label}.name`);

    const social = details.social;
    if (social && typeof social === "object") {
      touched =
        normalizeArray(social as Json, "accounts", "name", `${label}.social`) ||
        touched;
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
    const details = parse(row.details);
    if (!details) continue;

    const label = `application ${row.id}`;
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
          ) || touched;
      }
      touched =
        normalizeArray(
          team as Json,
          "additionalTeammates",
          "name",
          `${label}.team.additionalTeammates`,
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
  const rows = await db.selectFrom("rounds").select(["id", "details"]).execute();

  for (const row of rows) {
    const details = parse(row.details);
    if (!details) continue;

    const label = `round ${row.id}`;
    let touched = normalizeField(details, "name", `${label}.name`);

    const social = details.social;
    if (social && typeof social === "object") {
      touched =
        normalizeArray(social as Json, "accounts", "name", `${label}.social`) ||
        touched;
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
  const rows = await db.selectFrom("voterGroups").select(["id", "name"]).execute();

  for (const row of rows) {
    const holder: Json = { name: row.name };
    if (!normalizeField(holder, "name", `voterGroup ${row.id}.name`)) continue;

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
    `\n${DRY_RUN ? "[DRY RUN] " : ""}Done. ${DRY_RUN ? "Would change" : "Changed"}: ${changed}, skipped (normalize to empty): ${skippedEmpty}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
