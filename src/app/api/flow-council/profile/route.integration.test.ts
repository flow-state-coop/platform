import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

import { PUT } from "./route";
import { getTestDb, resetDb } from "@tests/helpers/db";
import { mockSession } from "@tests/helpers/session";

const db = getTestDb();

const ADDRESS = "0x2228e3cf25283be159643976665384215875f6a8";

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

describe("PUT /api/flow-council/profile — reproduce graven 500", () => {
  it("upserts first-time email + consent + prefs on a row that already exists with email=null", async () => {
    // Seed the row in the same shape we observed in prod for 0x2228...:
    // an existing user_profiles row with email=null, consentConfirmedAt=null,
    // and a display name set.
    await db
      .insertInto("userProfiles")
      .values({
        address: ADDRESS,
        displayName: "Testing Wallet 2",
      })
      .execute();

    mockSession(ADDRESS);

    const payload = {
      displayName: "Testing Wallet 2",
      bio: "",
      twitter: "",
      github: "",
      linkedin: "",
      farcaster: "",
      email: "graven@flowstate.network",
      telegram: "",
      consentConfirmedAt: new Date().toISOString(),
      consentVersion: "2026-05-13",
      notifyApplicationEligibility: true,
      notifyProjectChannels: true,
      notifyRoundAnnouncements: true,
      notifyInternalReview: true,
      notifyPlatform: true,
    };

    const res = await PUT(
      new Request("http://localhost/api/flow-council/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    const body = await readJson(res);
    expect({ status: res.status, body }).toEqual({
      status: 200,
      body: expect.objectContaining({ success: true }),
    });
  });
});
