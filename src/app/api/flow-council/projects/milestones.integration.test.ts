/**
 * Integration tests for the milestones GET and PATCH routes.
 * Covers both legacy (buildGoals/growthGoals) and dynamic (round[<elementId>])
 * milestone storage introduced by "Configurable Milestone Question Type for
 * Dynamic Form Builder".
 *
 * All tests that depend on the new feature are expected to FAIL until the
 * feature is implemented. Legacy-path tests may already pass.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

// Route handlers under test
import { GET, PATCH } from "./[projectId]/milestones/route";

import {
  getTestDb,
  resetAndSeed,
  resetDb,
  TEST_MANAGER_ADDRESS,
  TEST_CHAIN_ID,
  TEST_COUNCIL_ADDRESS,
  type SeededFixture,
} from "@tests/helpers/db";
import { mockSession } from "@tests/helpers/session";

const db = getTestDb();

let fixture: SeededFixture;

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  fixture = await resetAndSeed(db);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestMilestone = {
  type: string;
  milestoneLabel: string;
  itemLabel: string;
  index: number;
  title: string;
  description: string;
  itemNames: string[];
};

type TestApplication = {
  applicationId: number;
  milestones: TestMilestone[];
};

const ELEMENT_UUID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function makeGetRequest(projectId: number) {
  return new Request(
    `http://localhost/api/flow-council/projects/${projectId}/milestones`,
  );
}

function makePatchRequest(projectId: number, body: unknown) {
  return new Request(
    `http://localhost/api/flow-council/projects/${projectId}/milestones`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeRouteParams(projectId: number) {
  return { params: Promise.resolve({ projectId: String(projectId) }) };
}

/** Seed an ACCEPTED application with legacy buildGoals/growthGoals milestones */
async function seedLegacyApplication(projectId: number, roundId: number) {
  return db
    .insertInto("applications")
    .values({
      projectId,
      roundId,
      fundingAddress: TEST_MANAGER_ADDRESS,
      status: "ACCEPTED",
      editsUnlocked: true,
      details: JSON.stringify({
        buildGoals: {
          primaryBuildGoal: "Build something",
          milestones: [
            {
              title: "Build Milestone 1",
              description: "x".repeat(500),
              deliverables: ["Deliverable A", "Deliverable B"],
            },
          ],
          ecosystemImpact: "",
        },
        growthGoals: {
          primaryGrowthGoal: "Grow something",
          targetUsers: "Everyone",
          milestones: [
            {
              title: "Growth Milestone 1",
              description: "y".repeat(500),
              activations: ["Activation 1"],
            },
          ],
          ecosystemImpact: "",
        },
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

/** Seed an ACCEPTED application with editsUnlocked: false */
async function seedLockedApplication(
  projectId: number,
  roundId: number,
  details: unknown,
) {
  return db
    .insertInto("applications")
    .values({
      projectId,
      roundId,
      fundingAddress: TEST_MANAGER_ADDRESS,
      status: "ACCEPTED",
      editsUnlocked: false,
      details: JSON.stringify(details),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

/** Seed an ACCEPTED application with a dynamic milestone field */
async function seedDynamicApplication(
  projectId: number,
  roundId: number,
  elementId: string,
  milestones: Array<{ title: string; description: string; items: string[] }>,
) {
  return db
    .insertInto("applications")
    .values({
      projectId,
      roundId,
      fundingAddress: TEST_MANAGER_ADDRESS,
      status: "ACCEPTED",
      editsUnlocked: true,
      details: JSON.stringify({
        round: {
          [elementId]: milestones,
        },
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

/** Seed a round with a formSchema containing a milestone element.
 * Uses a chainId distinct from the fixture round to avoid the
 * (chain_id, flow_council_address) unique constraint. */
async function seedRoundWithMilestoneSchema(
  elementId: string,
  milestoneLabel: string,
  itemLabel: string,
  minCount: number = 1,
  chainId: number = TEST_CHAIN_ID + 1,
) {
  const round = await db
    .insertInto("rounds")
    .values({
      chainId,
      flowCouncilAddress: TEST_COUNCIL_ADDRESS,
      applicationsClosed: false,
      details: JSON.stringify({
        name: "Engineering Round",
        formSchema: {
          round: [
            {
              id: elementId,
              type: "milestone",
              label: "Engineering Milestones",
              required: true,
              milestoneLabel,
              itemLabel,
              minCount,
              descriptionMinChars: 50,
              descriptionMaxChars: 2000,
            },
          ],
          attestation: [],
        },
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return round;
}

// ---------------------------------------------------------------------------
// GET — legacy path
// ---------------------------------------------------------------------------

describe("GET /api/flow-council/projects/[projectId]/milestones — legacy", () => {
  it("returns MilestoneWithProgress[] with type 'build'/'growth' for legacy application", async () => {
    // Create a fresh project with an accepted legacy application
    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Legacy Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    await seedLegacyApplication(project.id, fixture.roundId);

    const res = await GET(
      makeGetRequest(project.id),
      makeRouteParams(project.id),
    );
    const body = await readJson(res);

    expect(body.success).toBe(true);
    expect(body.applications).toHaveLength(1);

    const milestones = body.applications[0].milestones;
    const buildMilestone = milestones.find(
      (m: TestMilestone) => m.type === "build",
    );
    const growthMilestone = milestones.find(
      (m: TestMilestone) => m.type === "growth",
    );

    expect(buildMilestone).toBeDefined();
    expect(buildMilestone.title).toBe("Build Milestone 1");
    expect(buildMilestone.itemNames).toEqual([
      "Deliverable A",
      "Deliverable B",
    ]);

    expect(growthMilestone).toBeDefined();
    expect(growthMilestone.title).toBe("Growth Milestone 1");
    expect(growthMilestone.itemNames).toEqual(["Activation 1"]);
  });

  it("legacy milestones expose milestoneLabel 'Build Milestone'/'Growth Milestone' and itemLabel 'Deliverable'/'Activation'", async () => {
    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Legacy Labels Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    await seedLegacyApplication(project.id, fixture.roundId);

    const res = await GET(
      makeGetRequest(project.id),
      makeRouteParams(project.id),
    );
    const body = await readJson(res);

    expect(body.success).toBe(true);
    const milestones = body.applications[0].milestones;

    const buildM = milestones.find((m: TestMilestone) => m.type === "build");
    const growthM = milestones.find((m: TestMilestone) => m.type === "growth");

    // The feature spec states legacy milestones must expose these labels
    // so the UI can render them consistently alongside dynamic milestones.
    expect(buildM.milestoneLabel).toBe("Build Milestone");
    expect(buildM.itemLabel).toBe("Deliverable");
    expect(growthM.milestoneLabel).toBe("Growth Milestone");
    expect(growthM.itemLabel).toBe("Activation");
  });
});

// ---------------------------------------------------------------------------
// GET — dynamic path
// ---------------------------------------------------------------------------

describe("GET /api/flow-council/projects/[projectId]/milestones — dynamic", () => {
  it("returns milestones with type=<elementId>, milestoneLabel, and itemLabel from the round formSchema", async () => {
    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Dynamic Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    await seedDynamicApplication(project.id, round.id, ELEMENT_UUID, [
      {
        title: "Ship the API",
        description: "x".repeat(50),
        items: ["Key Result 1", "Key Result 2"],
      },
    ]);

    const res = await GET(
      makeGetRequest(project.id),
      makeRouteParams(project.id),
    );
    const body = await readJson(res);

    expect(body.success).toBe(true);
    expect(body.applications).toHaveLength(1);

    const [milestone] = body.applications[0].milestones;
    expect(milestone.type).toBe(ELEMENT_UUID);
    expect(milestone.milestoneLabel).toBe("Engineering Milestone");
    expect(milestone.itemLabel).toBe("Key Result");
    expect(milestone.title).toBe("Ship the API");
    expect(milestone.itemNames).toEqual(["Key Result 1", "Key Result 2"]);
  });
});

// ---------------------------------------------------------------------------
// GET — coexistence: legacy + dynamic applications under the same project
// ---------------------------------------------------------------------------

describe("GET — legacy and dynamic applications do not cross-pollute", () => {
  it("each application's milestones are isolated from other applications on the same project", async () => {
    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    // A second round for the legacy application. Use a distinct chainId so we
    // don't collide with the fixture round or the dynamic round on
    // (chain_id, flow_council_address).
    const legacyRound = await db
      .insertInto("rounds")
      .values({
        chainId: TEST_CHAIN_ID + 2,
        flowCouncilAddress: TEST_COUNCIL_ADDRESS,
        applicationsClosed: false,
        details: JSON.stringify({ name: "Legacy Round" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Mixed Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const legacyApp = await seedLegacyApplication(project.id, legacyRound.id);
    const dynamicApp = await seedDynamicApplication(
      project.id,
      round.id,
      ELEMENT_UUID,
      [
        {
          title: "Dynamic Milestone",
          description: "z".repeat(50),
          items: ["KR 1"],
        },
      ],
    );

    const res = await GET(
      makeGetRequest(project.id),
      makeRouteParams(project.id),
    );
    const body = await readJson(res);

    expect(body.success).toBe(true);
    expect(body.applications).toHaveLength(2);

    const legacyResult = body.applications.find(
      (a: TestApplication) => a.applicationId === legacyApp.id,
    );
    const dynamicResult = body.applications.find(
      (a: TestApplication) => a.applicationId === dynamicApp.id,
    );

    // Legacy application only has legacy milestones
    const legacyTypes = legacyResult.milestones.map(
      (m: TestMilestone) => m.type,
    );
    expect(legacyTypes).toContain("build");
    expect(legacyTypes).toContain("growth");
    expect(legacyTypes).not.toContain(ELEMENT_UUID);

    // Dynamic application only has dynamic milestones
    const dynamicTypes = dynamicResult.milestones.map(
      (m: TestMilestone) => m.type,
    );
    expect(dynamicTypes).toContain(ELEMENT_UUID);
    expect(dynamicTypes).not.toContain("build");
    expect(dynamicTypes).not.toContain("growth");
  });
});

// ---------------------------------------------------------------------------
// PATCH — legacy path
// ---------------------------------------------------------------------------

describe("PATCH /api/flow-council/projects/[projectId]/milestones — legacy", () => {
  it("definition edit with milestoneType 'build' writes to buildGoals.milestones[index]", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Patch Legacy Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedLegacyApplication(project.id, fixture.roundId);

    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: "build",
        milestoneIndex: 0,
        definition: {
          title: "Updated Build Title",
          description: "u".repeat(500),
          items: ["New Deliverable"],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    // Verify the update was written to the DB
    const updated = await db
      .selectFrom("applications")
      .select("details")
      .where("id", "=", app.id)
      .executeTakeFirstOrThrow();

    const details = updated.details as {
      buildGoals: {
        milestones: Array<{
          title: string;
          description: string;
          deliverables: string[];
        }>;
      };
    };
    expect(details.buildGoals.milestones[0].title).toBe("Updated Build Title");
    expect(details.buildGoals.milestones[0].deliverables).toEqual([
      "New Deliverable",
    ]);
    // Gap 4: title and description must persist exactly as sent
    expect(details.buildGoals.milestones[0].title).toBe("Updated Build Title");
    expect(details.buildGoals.milestones[0].description).toBe("u".repeat(500));
  });

  it("rejects out-of-range milestoneIndex for 'build' with 400-class error", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "OOB Legacy Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedLegacyApplication(project.id, fixture.roundId);

    // Index 99 is way beyond the single milestone in the fixture
    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: "build",
        milestoneIndex: 99,
        definition: {
          title: "Should Not Exist",
          description: "x".repeat(500),
          items: ["item"],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(false);
    // The route returns a 400-level body; the HTTP status or body error must
    // indicate an out-of-range / invalid index condition.
    expect(body.error).toMatch(/out of range|invalid|index/i);
  });

  // Gap 2: editsUnlocked=false rejection — legacy path
  it("rejects definition edit when editsUnlocked is false (legacy)", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Locked Legacy Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedLockedApplication(project.id, fixture.roundId, {
      buildGoals: {
        primaryBuildGoal: "Build something",
        milestones: [
          {
            title: "Locked Milestone",
            description: "x".repeat(500),
            deliverables: ["Deliverable A"],
          },
        ],
        ecosystemImpact: "",
      },
    });

    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: "build",
        milestoneIndex: 0,
        definition: {
          title: "Should Be Blocked",
          description: "b".repeat(500),
          items: ["Blocked Item"],
        },
      }),
      makeRouteParams(project.id),
    );

    // Route at milestones/route.ts:240 returns 403 when !editsUnlocked
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/edit|unlock/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH — dynamic path
// ---------------------------------------------------------------------------

describe("PATCH /api/flow-council/projects/[projectId]/milestones — dynamic", () => {
  it("definition edit with milestoneType=<UUID> writes to appDetails.round[UUID][index]", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Patch Dynamic Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedDynamicApplication(
      project.id,
      round.id,
      ELEMENT_UUID,
      [
        {
          title: "Original Title",
          description: "x".repeat(50),
          items: ["KR 1"],
        },
      ],
    );

    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: ELEMENT_UUID,
        milestoneIndex: 0,
        definition: {
          title: "Updated Dynamic Title",
          description: "d".repeat(500),
          items: ["Updated KR 1", "KR 2"],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    const updated = await db
      .selectFrom("applications")
      .select("details")
      .where("id", "=", app.id)
      .executeTakeFirstOrThrow();

    const details = updated.details as {
      round: Record<
        string,
        Array<{ title: string; description: string; items: string[] }>
      >;
    };
    expect(details.round[ELEMENT_UUID][0].title).toBe("Updated Dynamic Title");
    expect(details.round[ELEMENT_UUID][0].items).toEqual([
      "Updated KR 1",
      "KR 2",
    ]);
    // Gap 4: title and description must persist exactly as sent
    expect(details.round[ELEMENT_UUID][0].title).toBe("Updated Dynamic Title");
    expect(details.round[ELEMENT_UUID][0].description).toBe("d".repeat(500));
  });

  // Gap 2: editsUnlocked=false rejection — dynamic path
  it("rejects definition edit when editsUnlocked is false (dynamic)", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Locked Dynamic Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedLockedApplication(project.id, round.id, {
      round: {
        [ELEMENT_UUID]: [
          {
            title: "Locked Dynamic Milestone",
            description: "x".repeat(50),
            items: ["KR 1"],
          },
        ],
      },
    });

    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: ELEMENT_UUID,
        milestoneIndex: 0,
        definition: {
          title: "Should Be Blocked",
          description: "b".repeat(500),
          items: ["Blocked KR"],
        },
      }),
      makeRouteParams(project.id),
    );

    // Route at milestones/route.ts:240 returns 403 when !editsUnlocked
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/edit|unlock/i);
  });

  it("stores the full UUID (>10 chars) in milestone_progress.milestone_type — validates VARCHAR(100) migration", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "UUID Storage Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedDynamicApplication(
      project.id,
      round.id,
      ELEMENT_UUID,
      [
        {
          title: "UUID Milestone",
          description: "x".repeat(50),
          items: ["Item 1"],
        },
      ],
    );

    // PATCH with a progress update (not a definition edit) so milestone_progress is written
    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: ELEMENT_UUID,
        milestoneIndex: 0,
        progress: {
          otherDetails: "",
          items: [{ completion: 50, evidence: [] }],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);

    // Verify that the stored milestone_type is the full UUID (36 chars), not truncated
    const progressRow = await db
      .selectFrom("milestoneProgress")
      .select("milestoneType")
      .where("applicationId", "=", app.id)
      .where("milestoneIndex", "=", 0)
      .executeTakeFirst();

    expect(progressRow).toBeDefined();
    expect(progressRow!.milestoneType).toBe(ELEMENT_UUID);
    expect(progressRow!.milestoneType.length).toBeGreaterThan(10);
    expect(progressRow!.milestoneType.length).toBeLessThanOrEqual(100);
  });

  it("rejects out-of-range milestoneIndex for a dynamic milestone type with error body", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "OOB Dynamic Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedDynamicApplication(
      project.id,
      round.id,
      ELEMENT_UUID,
      [
        {
          title: "Only Milestone",
          description: "x".repeat(50),
          items: ["KR 1"],
        },
      ],
    );

    // milestoneIndex 5 is out of range (only index 0 exists)
    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: ELEMENT_UUID,
        milestoneIndex: 5,
        definition: {
          title: "Ghost Milestone",
          description: "g".repeat(500),
          items: ["item"],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/out of range|invalid|index/i);
  });

  // Gap 3: Dual-channel feed assertion — both PUBLIC_PROJECT and PUBLIC_ROUND must be written
  it("PATCH progress feed post includes the configured milestoneLabel from the round formSchema (not hardcoded 'Build'/'Growth') — in both PUBLIC_PROJECT and PUBLIC_ROUND channels", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "Feed Label Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await seedDynamicApplication(
      project.id,
      round.id,
      ELEMENT_UUID,
      [
        {
          title: "Feed Milestone",
          description: "f".repeat(50),
          items: ["KR Feed"],
        },
      ],
    );

    await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: ELEMENT_UUID,
        milestoneIndex: 0,
        progress: {
          otherDetails: "Great progress this week",
          items: [{ completion: 25, evidence: [] }],
        },
      }),
      makeRouteParams(project.id),
    );

    // Both PUBLIC_PROJECT and PUBLIC_ROUND channels must have a message
    const projectMessages = await db
      .selectFrom("messages")
      .select("content")
      .where("projectId", "=", project.id)
      .where("messageType", "=", "milestone_update")
      .where("channelType", "=", "PUBLIC_PROJECT")
      .execute();

    const roundMessages = await db
      .selectFrom("messages")
      .select("content")
      .where("projectId", "=", project.id)
      .where("messageType", "=", "milestone_update")
      .where("channelType", "=", "PUBLIC_ROUND")
      .execute();

    // Gap 3: both channels must be populated
    expect(projectMessages.length).toBeGreaterThan(0);
    expect(roundMessages.length).toBeGreaterThan(0);

    // Both must contain the configured milestoneLabel, not legacy labels
    const projectContent = projectMessages[0].content;
    const roundContent = roundMessages[0].content;

    expect(projectContent).toContain("Engineering Milestone");
    expect(projectContent).not.toMatch(/\bBuild\b/);
    expect(projectContent).not.toMatch(/\bGrowth\b/);

    expect(roundContent).toContain("Engineering Milestone");
    expect(roundContent).not.toMatch(/\bBuild\b/);
    expect(roundContent).not.toMatch(/\bGrowth\b/);
  });
});

// ---------------------------------------------------------------------------
// PATCH — milestoneType length validation
// ---------------------------------------------------------------------------

describe("PATCH — milestoneType length validation", () => {
  it("accepts a 36-char UUID as milestoneType", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "UUID Len Accept Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const round = await seedRoundWithMilestoneSchema(
      ELEMENT_UUID,
      "Engineering Milestone",
      "Key Result",
    );

    const app = await seedDynamicApplication(
      project.id,
      round.id,
      ELEMENT_UUID,
      [{ title: "M1", description: "x".repeat(50), items: ["KR"] }],
    );

    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: ELEMENT_UUID, // 36 chars — valid UUID
        milestoneIndex: 0,
        progress: {
          otherDetails: "",
          items: [{ completion: 0, evidence: [] }],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(true);
  });

  it("rejects an empty string as milestoneType", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "UUID Len Empty Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await db
      .insertInto("applications")
      .values({
        projectId: project.id,
        roundId: fixture.roundId,
        fundingAddress: TEST_MANAGER_ADDRESS,
        status: "ACCEPTED",
        editsUnlocked: true,
        details: JSON.stringify({}),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: "",
        milestoneIndex: 0,
        progress: {
          otherDetails: "",
          items: [{ completion: 0, evidence: [] }],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  it("rejects a milestoneType string longer than 100 chars", async () => {
    mockSession(TEST_MANAGER_ADDRESS);

    const project = await db
      .insertInto("projects")
      .values({ details: JSON.stringify({ name: "UUID Len Long Project" }) })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("projectManagers")
      .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
      .execute();

    const app = await db
      .insertInto("applications")
      .values({
        projectId: project.id,
        roundId: fixture.roundId,
        fundingAddress: TEST_MANAGER_ADDRESS,
        status: "ACCEPTED",
        editsUnlocked: true,
        details: JSON.stringify({}),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const longType = "a".repeat(101);
    const res = await PATCH(
      makePatchRequest(project.id, {
        applicationId: app.id,
        milestoneType: longType,
        milestoneIndex: 0,
        progress: {
          otherDetails: "",
          items: [{ completion: 0, evidence: [] }],
        },
      }),
      makeRouteParams(project.id),
    );

    const body = await readJson(res);
    expect(body.success).toBe(false);
  });
});
