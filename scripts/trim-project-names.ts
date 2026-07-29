/**
 * Trim leading/trailing whitespace from projects.details.name. Names written
 * before the project schema trimmed them break exact-match lookups for API
 * consumers that resolve recipients by name.
 *
 * Run:         pnpm tsx scripts/trim-project-names.ts
 * Dry run:     DRY_RUN=1 pnpm tsx scripts/trim-project-names.ts
 */
import { db } from "../src/app/api/flow-council/db";

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  if (DRY_RUN) {
    console.log("[DRY RUN] No rows will be updated.");
  }

  const projects = await db
    .selectFrom("projects")
    .select(["id", "details"])
    .execute();

  let updated = 0;
  let skippedEmpty = 0;

  for (const project of projects) {
    let details: { name?: unknown } | null;

    try {
      details = (
        typeof project.details === "string"
          ? JSON.parse(project.details)
          : project.details
      ) as { name?: unknown } | null;
    } catch {
      console.log(`SKIP: project ${project.id} has corrupt details JSON`);
      continue;
    }

    if (typeof details?.name !== "string") continue;

    const trimmed = details.name.trim();
    if (trimmed === details.name) continue;

    // A name that is nothing but whitespace has no correct trimmed value and
    // would fail the schema's min(1) on the owner's next save, so leave it.
    if (trimmed.length === 0) {
      console.log(`SKIP: project ${project.id} has a whitespace-only name`);
      skippedEmpty++;
      continue;
    }

    console.log(
      `${DRY_RUN ? "[DRY] " : ""}project ${project.id}: ${JSON.stringify(
        details.name,
      )} -> ${JSON.stringify(trimmed)}`,
    );

    if (!DRY_RUN) {
      await db
        .updateTable("projects")
        .set({ details: JSON.stringify({ ...details, name: trimmed }) })
        .where("id", "=", project.id)
        .execute();
    }
    updated++;
  }

  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Done. ${
      DRY_RUN ? "Would update" : "Updated"
    }: ${updated}, whitespace-only skipped: ${skippedEmpty}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
