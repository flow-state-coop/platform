import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return {
    ...actual,
    hasOnChainRole: vi.fn().mockResolvedValue(false),
  };
});

import { PUT } from "./route";
import { PATCH } from "./[applicationId]/route";
import {
  getTestDb,
  resetAndSeed,
  resetDb,
  TEST_MANAGER_ADDRESS,
  TEST_CHAIN_ID,
} from "@tests/helpers/db";
import { mockSession } from "@tests/helpers/session";

const db = getTestDb();

const ELEMENT_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const COUNCIL_ADDRESS = "0x00000000000000000000000000000000000000aa";
const FUNDING_ADDRESS = "0x00000000000000000000000000000000000000bb";
const MIN_COUNT = 2;

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetAndSeed(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function milestone(label: string) {
  return {
    title: `Milestone ${label}`,
    description: `Description for milestone ${label}. `.repeat(4),
    items: [`Deliverable ${label}`],
  };
}

/**
 * An ACCEPTED, edits-unlocked application with three milestones, each carrying
 * a progress row whose otherDetails names the milestone it belongs to.
 */
async function seedGranteeWithProgress() {
  const project = await db
    .insertInto("projects")
    .values({ details: JSON.stringify({ name: "Grantee Project" }) })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("projectManagers")
    .values({ projectId: project.id, managerAddress: TEST_MANAGER_ADDRESS })
    .execute();

  const round = await db
    .insertInto("rounds")
    .values({
      chainId: TEST_CHAIN_ID,
      flowCouncilAddress: COUNCIL_ADDRESS,
      applicationsClosed: false,
      details: JSON.stringify({
        name: "Grantee Round",
        formSchema: {
          round: [
            {
              id: ELEMENT_ID,
              type: "milestone",
              label: "Milestones",
              required: true,
              minCount: MIN_COUNT,
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

  const application = await db
    .insertInto("applications")
    .values({
      projectId: project.id,
      roundId: round.id,
      fundingAddress: FUNDING_ADDRESS,
      status: "ACCEPTED",
      editsUnlocked: true,
      details: JSON.stringify({
        _formVersion: 1,
        round: {
          [ELEMENT_ID]: [milestone("A"), milestone("B"), milestone("C")],
        },
        attestation: {},
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const [index, label] of ["A", "B", "C"].entries()) {
    await db
      .insertInto("milestoneProgress")
      .values({
        applicationId: application.id,
        milestoneType: ELEMENT_ID,
        milestoneIndex: index,
        progress: JSON.stringify({
          otherDetails: `progress for ${label}`,
          items: [{ completion: (index + 1) * 10, evidence: [] }],
        }),
      })
      .execute();
  }

  return { projectId: project.id, applicationId: application.id };
}

function putRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/applications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function saveBody(
  projectId: number,
  milestones: unknown[],
  milestoneSources?: unknown,
) {
  return {
    projectId,
    chainId: TEST_CHAIN_ID,
    councilId: COUNCIL_ADDRESS,
    details: {
      _formVersion: 1,
      round: { [ELEMENT_ID]: milestones },
      attestation: {},
    },
    fundingAddress: FUNDING_ADDRESS,
    ...(milestoneSources === undefined ? {} : { milestoneSources }),
  };
}

async function readProgress(applicationId: number) {
  const rows = await db
    .selectFrom("milestoneProgress")
    .select(["milestoneIndex", "progress"])
    .where("applicationId", "=", applicationId)
    .orderBy("milestoneIndex")
    .execute();
  return rows.map((row) => ({
    index: row.milestoneIndex,
    otherDetails: (typeof row.progress === "string"
      ? JSON.parse(row.progress)
      : row.progress
    )?.otherDetails,
  }));
}

async function readStoredMilestones(applicationId: number) {
  const row = await db
    .selectFrom("applications")
    .select("details")
    .where("id", "=", applicationId)
    .executeTakeFirstOrThrow();
  const details =
    typeof row.details === "string" ? JSON.parse(row.details) : row.details;
  return details.round[ELEMENT_ID] as Record<string, unknown>[];
}

describe("PUT /api/flow-council/applications — milestone progress remap", () => {
  beforeEach(() => {
    mockSession(TEST_MANAGER_ADDRESS);
  });

  it("moves progress with its milestone when a middle milestone is deleted", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    const res = await PUT(
      putRequest(
        saveBody(projectId, [milestone("A"), milestone("C")], {
          [ELEMENT_ID]: [0, 2],
        }),
      ),
    );

    expect((await readJson(res)).success).toBe(true);
    expect(await readProgress(applicationId)).toEqual([
      { index: 0, otherDetails: "progress for A" },
      { index: 1, otherDetails: "progress for C" },
    ]);
  });

  it("drops progress for a deleted milestone rather than orphaning it", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    await PUT(
      putRequest(
        saveBody(projectId, [milestone("B"), milestone("C")], {
          [ELEMENT_ID]: [1, 2],
        }),
      ),
    );

    const progress = await readProgress(applicationId);
    expect(progress.map((p) => p.otherDetails)).not.toContain("progress for A");
    expect(progress).toHaveLength(2);
  });

  it("keeps progress in place when a milestone is appended", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    const res = await PUT(
      putRequest(
        saveBody(
          projectId,
          [milestone("A"), milestone("B"), milestone("C"), milestone("D")],
          { [ELEMENT_ID]: [0, 1, 2, null] },
        ),
      ),
    );

    expect((await readJson(res)).success).toBe(true);
    expect(await readProgress(applicationId)).toEqual([
      { index: 0, otherDetails: "progress for A" },
      { index: 1, otherDetails: "progress for B" },
      { index: 2, otherDetails: "progress for C" },
    ]);
    expect(await readStoredMilestones(applicationId)).toHaveLength(4);
  });

  it("never persists the editor-only sourceIndex bookkeeping", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    await PUT(
      putRequest(
        saveBody(projectId, [milestone("A"), milestone("C")], {
          [ELEMENT_ID]: [0, 2],
        }),
      ),
    );

    for (const stored of await readStoredMilestones(applicationId)) {
      expect(stored).not.toHaveProperty("sourceIndex");
    }
  });

  it("still enforces the element's minimum milestone count", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    const res = await PUT(
      putRequest(saveBody(projectId, [milestone("A")], { [ELEMENT_ID]: [0] })),
    );

    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toContain(
      `at least ${MIN_COUNT} milestones`,
    );
    // The rejected save leaves both the milestones and their progress untouched.
    expect(await readStoredMilestones(applicationId)).toHaveLength(3);
    expect(await readProgress(applicationId)).toHaveLength(3);
  });

  it("rejects provenance that reuses a stored index", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    const res = await PUT(
      putRequest(
        saveBody(projectId, [milestone("A"), milestone("B")], {
          [ELEMENT_ID]: [1, 1],
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe("Invalid milestone sources");
    expect(await readProgress(applicationId)).toHaveLength(3);
  });

  it("leaves progress alone when a save carries no provenance", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();

    const res = await PUT(
      putRequest(
        saveBody(projectId, [milestone("A"), milestone("B"), milestone("C")]),
      ),
    );

    expect((await readJson(res)).success).toBe(true);
    expect(await readProgress(applicationId)).toHaveLength(3);
  });

  it("rejects a replayed save whose provenance no longer matches the stored milestones", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();
    const deleteMiddle = saveBody(projectId, [milestone("A"), milestone("C")], {
      [ELEMENT_ID]: [0, 2],
    });

    expect((await readJson(await PUT(putRequest(deleteMiddle)))).success).toBe(
      true,
    );

    // Replaying the same body (a double-submit) names index 2, which no longer
    // exists. Applying it would delete milestone C's progress instead of
    // keeping it.
    const replay = await PUT(putRequest(deleteMiddle));

    expect(replay.status).toBe(400);
    expect(await readProgress(applicationId)).toEqual([
      { index: 0, otherDetails: "progress for A" },
      { index: 1, otherDetails: "progress for C" },
    ]);
  });

  it("keeps progress consistent when two saves race", async () => {
    const { projectId, applicationId } = await seedGranteeWithProgress();
    const deleteMiddle = saveBody(projectId, [milestone("A"), milestone("C")], {
      [ELEMENT_ID]: [0, 2],
    });

    const [first, second] = await Promise.all([
      PUT(putRequest(deleteMiddle)),
      PUT(putRequest(deleteMiddle)),
    ]);
    const statuses = [first.status, second.status].sort();

    // Exactly one save wins; the loser is turned away rather than remapping
    // against milestones that moved under it.
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect(await readProgress(applicationId)).toEqual([
      { index: 0, otherDetails: "progress for A" },
      { index: 1, otherDetails: "progress for C" },
    ]);
  });
});

describe("PATCH /api/flow-council/applications/[applicationId] — milestone progress remap", () => {
  beforeEach(() => {
    mockSession(TEST_MANAGER_ADDRESS);
  });

  function patchRequest(applicationId: number, body: unknown) {
    return new Request(
      `http://localhost/api/flow-council/applications/${applicationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  function routeParams(applicationId: number) {
    return {
      params: Promise.resolve({ applicationId: String(applicationId) }),
    };
  }

  function patchBody(milestones: unknown[], milestoneSources?: unknown) {
    return {
      details: {
        _formVersion: 1,
        round: { [ELEMENT_ID]: milestones },
        attestation: {},
      },
      ...(milestoneSources === undefined ? {} : { milestoneSources }),
    };
  }

  it("moves progress with its milestone when a middle milestone is deleted", async () => {
    const { applicationId } = await seedGranteeWithProgress();

    const res = await PATCH(
      patchRequest(
        applicationId,
        patchBody([milestone("A"), milestone("C")], { [ELEMENT_ID]: [0, 2] }),
      ),
      routeParams(applicationId),
    );

    expect((await readJson(res)).success).toBe(true);
    expect(await readProgress(applicationId)).toEqual([
      { index: 0, otherDetails: "progress for A" },
      { index: 1, otherDetails: "progress for C" },
    ]);
  });

  it("rejects provenance that names a milestone the stored array does not have", async () => {
    const { applicationId } = await seedGranteeWithProgress();

    const res = await PATCH(
      patchRequest(
        applicationId,
        patchBody([milestone("A"), milestone("B"), milestone("C")], {
          [ELEMENT_ID]: [0, 1, 7],
        }),
      ),
      routeParams(applicationId),
    );

    expect(res.status).toBe(400);
    expect(await readProgress(applicationId)).toHaveLength(3);
  });

  it("leaves progress alone when a save carries no provenance", async () => {
    const { applicationId } = await seedGranteeWithProgress();

    const res = await PATCH(
      patchRequest(
        applicationId,
        patchBody([milestone("A"), milestone("B"), milestone("C")]),
      ),
      routeParams(applicationId),
    );

    expect((await readJson(res)).success).toBe(true);
    expect(await readProgress(applicationId)).toHaveLength(3);
  });
});
