import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: vi.fn() };
});

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

vi.mock("../s3", () => ({
  deleteObjectByPublicUrl: vi.fn(async () => undefined),
}));

import { PATCH } from "./route";
import { deleteObjectByPublicUrl } from "../s3";
import {
  getTestDb,
  resetDb,
  seedTestData,
  TEST_ADMIN_ADDRESS,
  TEST_OUTSIDER_ADDRESS,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
} from "@tests/helpers/db";
import { mockSession, mockUnauthenticated } from "@tests/helpers/session";

const db = getTestDb();

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  await resetDb(db);
  await seedTestData(db);
});

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/rounds", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fetchStoredDetails() {
  const stored = await db
    .selectFrom("rounds")
    .select("details")
    .where("chainId", "=", TEST_CHAIN_ID)
    .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
    .executeTakeFirstOrThrow();

  return typeof stored.details === "string"
    ? JSON.parse(stored.details)
    : stored.details;
}

// Spec: "Only round/pool admins may change the flag. For councils this is
//        enforced server-side via the existing SIWE admin check."
describe("PATCH /api/flow-council/rounds — listed flag", () => {
  const basePayload = {
    chainId: TEST_CHAIN_ID,
    flowCouncilAddress: TEST_COUNCIL_ADDRESS,
    name: "Test Round",
    description: "A test round",
  };

  it("rejects unauthenticated requests", async () => {
    mockUnauthenticated();
    const res = await PATCH(patchRequest({ ...basePayload, listed: true }));
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthenticated");
  });

  it("rejects a non-admin from changing listed", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const res = await PATCH(patchRequest({ ...basePayload, listed: true }));
    const body = await readJson(res);
    expect(body.success).toBe(false);
  });

  // Spec: "PATCH with listed:true stores listed in the details JSON"
  it("stores listed:true in rounds.details when admin sends listed:true", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(patchRequest({ ...basePayload, listed: true }));
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(true);
  });

  // Spec: "PATCH with listed:false updates it"
  it("stores listed:false in rounds.details when admin sends listed:false", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(patchRequest({ ...basePayload, listed: false }));
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(false);
  });

  // Spec: "a PATCH WITHOUT `listed` preserves the existing value (the merge
  //        must not drop it)"
  it("preserves an existing listed:true when a PATCH omits the listed field", async () => {
    // First, set listed:true
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(patchRequest({ ...basePayload, listed: true }));

    // Now PATCH without listed — should preserve it
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({ ...basePayload, name: "Updated Name" }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    // The existing listed:true must not have been clobbered
    expect(details.listed).toBe(true);
  });

  // Spec: "A Flow Council row whose `details` has no `listed` field reads as Unlisted"
  it("rounds with no listed field in details default to unlisted (listed absent means unlisted)", async () => {
    // The seed inserts a round with details: {} — no listed field
    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    // listed absent → unlisted (i.e. not true)
    expect(details.listed).not.toBe(true);
  });

  it("does not alter other fields in details when updating listed", async () => {
    // Set name and description first
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(
      patchRequest({
        ...basePayload,
        name: "My Round",
        description: "My desc",
      }),
    );

    // Now set listed:true
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(
      patchRequest({
        ...basePayload,
        name: "My Round",
        description: "My desc",
        listed: true,
      }),
    );

    const stored = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", TEST_CHAIN_ID)
      .where("flowCouncilAddress", "=", TEST_COUNCIL_ADDRESS.toLowerCase())
      .executeTakeFirstOrThrow();

    const details =
      typeof stored.details === "string"
        ? JSON.parse(stored.details)
        : stored.details;
    expect(details.listed).toBe(true);
    expect(details.name).toBe("My Round");
    expect(details.description).toBe("My desc");
  });
});

// Spec (.claude/specs/social-share-tab.md):
// - "Saving the Social tab uses the same round-admin authorization as the
//   other admin tabs."
// - Success criterion 3: "It's impossible to save a message that would
//   overflow either platform (X 280 with link as 23 chars; Farcaster 320
//   excluding the embedded link)."
// - "Handle fields accept a pasted profile URL or a bare handle and
//   normalize either."
// - Image lifecycle: "the previous file is deleted from storage. Deletion is
//   best-effort — a failed cleanup never blocks saving."
describe("PATCH /api/flow-council/rounds — social config", () => {
  const basePayload = {
    chainId: TEST_CHAIN_ID,
    flowCouncilAddress: TEST_COUNCIL_ADDRESS,
    name: "Test Round",
    description: "A test round",
  };

  const socialBlock = {
    accounts: [
      {
        id: "acc-1",
        name: "Octant",
        xHandle: "octantapp",
        farcasterHandle: "octant",
      },
    ],
    voteMessage: "Voted for @[Octant] in {round name}! {round link}",
    donationMessage: "Streaming to {round name} with @[Octant]. {round link}",
    shareImageUrl: "https://example.com/share.png",
  };

  beforeEach(() => {
    vi.mocked(deleteObjectByPublicUrl).mockClear();
  });

  it("round-trips a social block into details.social for an admin", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({ ...basePayload, social: socialBlock }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const details = await fetchStoredDetails();
    expect(details.social).toEqual(socialBlock);
  });

  // Impl plan: "PATCH with only social (no name/description) succeeds and
  // preserves existing name/description/logoUrl/listed" — guards the clobber
  // class of bugs previously seen with `listed`.
  it("accepts a social-only PATCH and preserves existing name, description, logoUrl, and listed", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    await PATCH(
      patchRequest({
        ...basePayload,
        logoUrl: "https://example.com/logo.png",
        listed: true,
      }),
    );

    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        chainId: TEST_CHAIN_ID,
        flowCouncilAddress: TEST_COUNCIL_ADDRESS,
        social: socialBlock,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const details = await fetchStoredDetails();
    expect(details.name).toBe("Test Round");
    expect(details.description).toBe("A test round");
    expect(details.logoUrl).toBe("https://example.com/logo.png");
    expect(details.listed).toBe(true);
    expect(details.social).toEqual(socialBlock);
  });

  it("rejects a non-admin from saving social config", async () => {
    mockSession(TEST_OUTSIDER_ADDRESS);
    const res = await PATCH(
      patchRequest({
        chainId: TEST_CHAIN_ID,
        flowCouncilAddress: TEST_COUNCIL_ADDRESS,
        social: socialBlock,
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(false);

    const details = await fetchStoredDetails();
    expect(details.social).toBeUndefined();
  });

  // Success criterion 3 (server half): 300 plain chars resolves to 300 on X
  // (> 280) but 300 on Farcaster (<= 320), so the error must name X.
  it("rejects a vote message that resolves over the X limit with a 400 naming the platform", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: { accounts: [], voteMessage: "x".repeat(300) },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/vote/i);
    expect(body.error).toMatch(/\bX\b/);

    const details = await fetchStoredDetails();
    expect(details.social).toBeUndefined();
  });

  // The verdict must come from token resolution, not the raw template length:
  // raw = 263 + 1 + "{round link}".length = 276 (under 280), but resolved X
  // length = 263 + 1 + 23 (link) = 287 (over 280). Farcaster = 263 (fine).
  it("rejects a vote message whose raw length fits but whose resolved X length exceeds 280", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: {
          accounts: [],
          voteMessage: "x".repeat(263) + " {round link}",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/vote/i);
    expect(body.error).toMatch(/\bX\b/);

    const details = await fetchStoredDetails();
    expect(details.social).toBeUndefined();
  });

  // Farcaster overflow with X under its limit: mentions of an account whose
  // X handle is 1 char but whose Farcaster handle is 49 chars.
  // X resolved: 7 * "@a" + 7 spaces + link as 23 = 44 (under 280).
  // Farcaster resolved: 7 * ("@" + 49 chars) + 6 spaces, link excluded
  // = 356 (over 320). The error must name Farcaster.
  it("rejects a vote message that resolves over the Farcaster limit while fitting on X, naming Farcaster", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: {
          accounts: [
            {
              id: "acc-long",
              name: "Long",
              xHandle: "a",
              farcasterHandle: "f".repeat(49),
            },
          ],
          voteMessage: Array(7).fill("@[Long]").join(" ") + " {round link}",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/vote/i);
    expect(body.error).toMatch(/farcaster/i);

    const details = await fetchStoredDetails();
    expect(details.social).toBeUndefined();
  });

  it("rejects a donation message that resolves over the X limit, naming the donation message", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: { accounts: [], donationMessage: "y".repeat(300) },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/donation/i);
    expect(body.error).toMatch(/\bX\b/);
  });

  // "Exceeds its limit" is strict: exactly 280 on X is allowed.
  it("accepts a vote message that resolves to exactly 280 characters on X", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: { accounts: [], voteMessage: "x".repeat(280) },
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const details = await fetchStoredDetails();
    expect(details.social.voteMessage).toBe("x".repeat(280));
  });

  it("normalizes pasted URLs and @-handles to bare handles on save", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: {
          accounts: [
            {
              id: "acc-1",
              name: "Alice",
              xHandle: "https://x.com/alice",
              farcasterHandle: "@bob",
            },
          ],
        },
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const details = await fetchStoredDetails();
    expect(details.social.accounts[0].xHandle).toBe("alice");
    expect(details.social.accounts[0].farcasterHandle).toBe("bob");
  });

  it("drops handles that normalize to empty instead of storing empty strings", async () => {
    mockSession(TEST_ADMIN_ADDRESS);
    const res = await PATCH(
      patchRequest({
        ...basePayload,
        social: {
          accounts: [
            {
              id: "acc-1",
              name: "NoX",
              xHandle: "",
              farcasterHandle: "bob",
            },
          ],
        },
      }),
    );
    const body = await readJson(res);
    expect(body.success).toBe(true);

    const details = await fetchStoredDetails();
    expect(details.social.accounts[0].xHandle).toBeUndefined();
    expect(details.social.accounts[0].farcasterHandle).toBe("bob");
  });

  describe("share image lifecycle", () => {
    // The delete-on-replace is scoped to the caller's own share-images prefix
    // on the configured bucket host, so the stored fixtures must be URLs the
    // admin's own uploads would produce.
    const S3_PUBLIC_URL = process.env.AWS_S3_PUBLIC_URL;
    const CALLER_PREFIX = `${S3_PUBLIC_URL}/share-images/${TEST_ADMIN_ADDRESS.toLowerCase()}`;
    const OLD_IMAGE_URL = `${CALLER_PREFIX}/111.png`;
    const NEW_IMAGE_URL = `${CALLER_PREFIX}/222.png`;

    it("attempts best-effort deletion of the replaced image's old object", async () => {
      mockSession(TEST_ADMIN_ADDRESS);
      await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: OLD_IMAGE_URL },
        }),
      );

      mockSession(TEST_ADMIN_ADDRESS);
      const res = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: NEW_IMAGE_URL },
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(deleteObjectByPublicUrl).toHaveBeenCalledTimes(1);
      expect(deleteObjectByPublicUrl).toHaveBeenCalledWith(OLD_IMAGE_URL);

      const details = await fetchStoredDetails();
      expect(details.social.shareImageUrl).toBe(NEW_IMAGE_URL);
    });

    it("does not call the S3 delete on the first-ever image set", async () => {
      mockSession(TEST_ADMIN_ADDRESS);
      const res = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: NEW_IMAGE_URL },
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(deleteObjectByPublicUrl).not.toHaveBeenCalled();
    });

    it("does not call the S3 delete when shareImageUrl is unchanged", async () => {
      mockSession(TEST_ADMIN_ADDRESS);
      await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: OLD_IMAGE_URL },
        }),
      );

      mockSession(TEST_ADMIN_ADDRESS);
      const res = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: OLD_IMAGE_URL },
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(deleteObjectByPublicUrl).not.toHaveBeenCalled();
    });

    it("deletes the old object when the image is removed (shareImageUrl cleared)", async () => {
      mockSession(TEST_ADMIN_ADDRESS);
      await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: OLD_IMAGE_URL },
        }),
      );

      mockSession(TEST_ADMIN_ADDRESS);
      const res = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: "" },
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(deleteObjectByPublicUrl).toHaveBeenCalledTimes(1);
      expect(deleteObjectByPublicUrl).toHaveBeenCalledWith(OLD_IMAGE_URL);

      const details = await fetchStoredDetails();
      expect(details.social.shareImageUrl).toBe("");
    });

    // SEC-C1: a stored URL outside the caller's own share-images prefix must
    // never be deleted, or any admin could delete arbitrary bucket objects by
    // storing a victim URL and then replacing it.
    it("does not delete a replaced old URL that points outside the caller's share-images prefix", async () => {
      const victimProjectUrl = `${S3_PUBLIC_URL}/projects/0xvictim/logo.png`;
      const otherUserShareImageUrl = `${S3_PUBLIC_URL}/share-images/${TEST_OUTSIDER_ADDRESS.toLowerCase()}/x.png`;

      mockSession(TEST_ADMIN_ADDRESS);
      await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: victimProjectUrl },
        }),
      );

      mockSession(TEST_ADMIN_ADDRESS);
      const firstReplace = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: otherUserShareImageUrl },
        }),
      );
      expect((await readJson(firstReplace)).success).toBe(true);
      expect(deleteObjectByPublicUrl).not.toHaveBeenCalled();

      mockSession(TEST_ADMIN_ADDRESS);
      const secondReplace = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: NEW_IMAGE_URL },
        }),
      );
      expect((await readJson(secondReplace)).success).toBe(true);
      expect(deleteObjectByPublicUrl).not.toHaveBeenCalled();

      const details = await fetchStoredDetails();
      expect(details.social.shareImageUrl).toBe(NEW_IMAGE_URL);
    });

    // COR-M4: omitting shareImageUrl from a social PATCH means "preserve the
    // existing value" — it must neither clear the stored URL nor delete the
    // object.
    it("preserves the stored shareImageUrl and calls no delete when a social PATCH omits it", async () => {
      mockSession(TEST_ADMIN_ADDRESS);
      await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: OLD_IMAGE_URL },
        }),
      );

      mockSession(TEST_ADMIN_ADDRESS);
      const res = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], voteMessage: "Updated! {round link}" },
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(deleteObjectByPublicUrl).not.toHaveBeenCalled();

      const details = await fetchStoredDetails();
      expect(details.social.shareImageUrl).toBe(OLD_IMAGE_URL);
      expect(details.social.voteMessage).toBe("Updated! {round link}");
    });

    // Spec: "Deletion is best-effort — a failed cleanup never blocks saving."
    it("succeeds and stores the new shareImageUrl even when the old-image S3 delete fails", async () => {
      mockSession(TEST_ADMIN_ADDRESS);
      await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: OLD_IMAGE_URL },
        }),
      );

      vi.mocked(deleteObjectByPublicUrl).mockRejectedValueOnce(
        new Error("AccessDenied"),
      );
      mockSession(TEST_ADMIN_ADDRESS);
      const res = await PATCH(
        patchRequest({
          ...basePayload,
          social: { accounts: [], shareImageUrl: NEW_IMAGE_URL },
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);

      const details = await fetchStoredDetails();
      expect(details.social.shareImageUrl).toBe(NEW_IMAGE_URL);
    });
  });
});
