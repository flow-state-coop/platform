import type { Kysely } from "kysely";
import type { DB } from "@/generated/kysely";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";
import { getTestDb, resetDb } from "@tests/helpers/db";
import { getTestAccount, TEST_CHAIN_ID } from "./mockEthereum";

// A fresh sentinel distinct from the integration tests' TEST_COUNCIL_ADDRESS
// so a leaked row cannot satisfy both suites at once.
const E2E_COUNCIL_ADDRESS = "0xe2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0";

export type E2eFixture = {
  chainId: number;
  councilAddress: string;
  walletAddress: string;
  roundId: number;
  projectId: number;
  secondaryProjectId: number;
  applicationId: number;
};

const MIN_DESCRIPTION = "x".repeat(CHARACTER_LIMITS.projectDescription.min);

// Dedicated seeder: does NOT delegate to seedTestData because that helper
// hardcodes chainId 10 and sentinel manager addresses. E2E needs the
// TEST_PRIVATE_KEY-derived address as the manager so the connected wallet
// can act on its own projects.
export async function seedE2eFixture(
  db: Kysely<DB> = getTestDb(),
): Promise<E2eFixture> {
  const walletAddress = getTestAccount().address.toLowerCase();

  const round = await db
    .insertInto("rounds")
    .values({
      chainId: TEST_CHAIN_ID,
      flowCouncilAddress: E2E_COUNCIL_ADDRESS,
      applicationsClosed: false,
      details: JSON.stringify({ name: "E2E Round" }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("roundAdmins")
    .values({ roundId: round.id, adminAddress: walletAddress })
    .execute();

  const primary = await db
    .insertInto("projects")
    .values({
      details: JSON.stringify({
        name: "E2E Primary Project",
        description: MIN_DESCRIPTION,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const secondary = await db
    .insertInto("projects")
    .values({
      details: JSON.stringify({
        name: "E2E Secondary Project",
        description: MIN_DESCRIPTION,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("projectManagers")
    .values([
      { projectId: primary.id, managerAddress: walletAddress },
      { projectId: secondary.id, managerAddress: walletAddress },
    ])
    .execute();

  const application = await db
    .insertInto("applications")
    .values({
      projectId: secondary.id,
      roundId: round.id,
      fundingAddress: walletAddress,
      status: "SUBMITTED",
      details: JSON.stringify({}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return {
    chainId: TEST_CHAIN_ID,
    councilAddress: E2E_COUNCIL_ADDRESS,
    walletAddress,
    roundId: round.id,
    projectId: primary.id,
    secondaryProjectId: secondary.id,
    applicationId: application.id,
  };
}

export async function teardownE2eDb(
  db: Kysely<DB> = getTestDb(),
): Promise<void> {
  await resetDb(db);
  await db.destroy();
}
