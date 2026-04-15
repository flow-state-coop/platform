import { Kysely, CamelCasePlugin, sql } from "kysely";
import { NeonDialect } from "kysely-neon";
import type { DB } from "@/generated/kysely";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";

export const TEST_MANAGER_ADDRESS =
  "0x1111111111111111111111111111111111111111";
export const TEST_OTHER_MANAGER_ADDRESS =
  "0x3333333333333333333333333333333333333333";
export const TEST_ADMIN_ADDRESS =
  "0x2222222222222222222222222222222222222222";
export const TEST_OUTSIDER_ADDRESS =
  "0x4444444444444444444444444444444444444444";
export const TEST_COUNCIL_ADDRESS =
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
export const TEST_CHAIN_ID = 10;

// Singleton shared across all test files in the same process. Vitest's
// integration project forks per file (fileParallelism: false + forks pool),
// so `db.destroy()` in one file's afterAll only closes this process's
// connection. If that isolation model changes, this needs revisiting.
let cached: Kysely<DB> | null = null;

export function getTestDb(): Kysely<DB> {
  if (cached) return cached;
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL is not set — put it in .env.test.local at the repo root",
    );
  }
  // Guard against pointing the test helpers at the production DB. resetDb()
  // issues DELETEs across every table; aborting here is the last line of
  // defence if TEST_DATABASE_URL is misconfigured.
  const prodUrl = process.env.COUNCIL_DATABASE_URL;
  if (prodUrl && connectionString === prodUrl) {
    throw new Error(
      "TEST_DATABASE_URL equals COUNCIL_DATABASE_URL — refusing to run tests against production",
    );
  }
  cached = new Kysely<DB>({
    dialect: new NeonDialect({ connectionString }),
    plugins: [new CamelCasePlugin()],
  });
  return cached;
}

// TRUNCATE ... RESTART IDENTITY CASCADE wipes every table in one round-trip
// and resets sequences, avoiding the per-table DELETE chatter and the
// FK-ordering maintenance that goes with it. Physical (snake_case) table
// names are used here because raw SQL bypasses the CamelCasePlugin.
const TABLES_TO_RESET = [
  "message_reactions",
  "messages",
  "milestone_progress",
  "recipients",
  "applications",
  "project_emails",
  "project_managers",
  "projects",
  "user_profiles",
  "round_admin_emails",
  "round_admins",
  "rounds",
] as const;

export async function resetDb(db: Kysely<DB>): Promise<void> {
  const identifiers = TABLES_TO_RESET.map((t) => sql.table(t));
  await sql`truncate table ${sql.join(identifiers)} restart identity cascade`.execute(
    db,
  );
}

const MIN_DESCRIPTION = "x".repeat(CHARACTER_LIMITS.projectDescription.min);

export type SeededFixture = {
  roundId: number;
  alphaProjectId: number;
  betaProjectId: number;
  submittedApplicationId: number;
  acceptedApplicationId: number;
  rejectedApplicationId: number;
  messageId: number;
};

export async function seedTestData(db: Kysely<DB>): Promise<SeededFixture> {
  const round = await db
    .insertInto("rounds")
    .values({
      chainId: TEST_CHAIN_ID,
      flowCouncilAddress: TEST_COUNCIL_ADDRESS,
      applicationsClosed: false,
      details: JSON.stringify({}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("roundAdmins")
    .values({ roundId: round.id, adminAddress: TEST_ADMIN_ADDRESS })
    .execute();

  const alpha = await db
    .insertInto("projects")
    .values({
      details: JSON.stringify({
        name: "Project Alpha",
        description: MIN_DESCRIPTION,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const beta = await db
    .insertInto("projects")
    .values({
      details: JSON.stringify({
        name: "Project Beta",
        description: MIN_DESCRIPTION,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("projectManagers")
    .values([
      { projectId: alpha.id, managerAddress: TEST_MANAGER_ADDRESS },
      { projectId: beta.id, managerAddress: TEST_OTHER_MANAGER_ADDRESS },
    ])
    .execute();

  const submitted = await db
    .insertInto("applications")
    .values({
      projectId: alpha.id,
      roundId: round.id,
      fundingAddress: TEST_MANAGER_ADDRESS,
      status: "SUBMITTED",
      details: JSON.stringify({}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const accepted = await db
    .insertInto("applications")
    .values({
      projectId: beta.id,
      roundId: round.id,
      fundingAddress: TEST_OTHER_MANAGER_ADDRESS,
      status: "ACCEPTED",
      details: JSON.stringify({}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Third project just for the REJECTED application so the (project, round)
  // unique pattern is not fought.
  const gamma = await db
    .insertInto("projects")
    .values({
      details: JSON.stringify({
        name: "Project Gamma",
        description: MIN_DESCRIPTION,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("projectManagers")
    .values({ projectId: gamma.id, managerAddress: TEST_OTHER_MANAGER_ADDRESS })
    .execute();
  const rejected = await db
    .insertInto("applications")
    .values({
      projectId: gamma.id,
      roundId: round.id,
      fundingAddress: TEST_OTHER_MANAGER_ADDRESS,
      status: "REJECTED",
      details: JSON.stringify({}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const message = await db
    .insertInto("messages")
    .values({
      channelType: "PUBLIC_ROUND",
      roundId: round.id,
      authorAddress: TEST_MANAGER_ADDRESS,
      content: "hello round",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("messageReactions")
    .values({
      messageId: message.id,
      authorAddress: TEST_MANAGER_ADDRESS,
      emoji: "\u{1F44D}",
    })
    .execute();

  return {
    roundId: round.id,
    alphaProjectId: alpha.id,
    betaProjectId: beta.id,
    submittedApplicationId: submitted.id,
    acceptedApplicationId: accepted.id,
    rejectedApplicationId: rejected.id,
    messageId: message.id,
  };
}

export async function resetAndSeed(db: Kysely<DB>): Promise<SeededFixture> {
  await resetDb(db);
  return seedTestData(db);
}
