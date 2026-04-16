import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createPublicClient } from "viem";

// Hoist viem mock so it applies before any module importing createPublicClient
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: vi.fn() };
});

vi.mock("./db", async () => {
  const { getTestDb } = await import("@tests/helpers/db");
  return { db: getTestDb() };
});

// adminCache is exported in stage 3 — import as if it already exists.
import {
  isAdmin,
  canReadChannel,
  canWriteChannel,
  canModerateChannel,
  adminCache,
} from "./auth";
import {
  getTestDb,
  resetAndSeed,
  resetDb,
  TEST_ADMIN_ADDRESS,
  TEST_MANAGER_ADDRESS,
  TEST_OTHER_MANAGER_ADDRESS,
  TEST_OUTSIDER_ADDRESS,
  TEST_COUNCIL_ADDRESS,
  TEST_CHAIN_ID,
  type SeededFixture,
} from "@tests/helpers/db";
import { mockPublicClient } from "@tests/helpers/publicClient";
import {
  DEFAULT_ADMIN_ROLE,
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
} from "@/app/flow-councils/lib/constants";

const db = getTestDb();
let fixture: SeededFixture;

afterAll(async () => {
  await resetDb(db);
  await db.destroy();
});

beforeEach(async () => {
  fixture = await resetAndSeed(db);
  adminCache.clear();
  // Default: no on-chain roles granted
  vi.mocked(createPublicClient).mockReturnValue(
    mockPublicClient([
      {
        address: TEST_COUNCIL_ADDRESS,
        functionName: "hasRole",
        returnValue: false,
      },
    ]) as unknown as ReturnType<typeof createPublicClient>,
  );
});

// ---------------------------------------------------------------------------
// isAdmin
// ---------------------------------------------------------------------------

describe("isAdmin", () => {
  it("(a) DB admin returns true even when on-chain returns false", async () => {
    const result = await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("(b) on-chain DEFAULT_ADMIN_ROLE true → true (no DB row)", async () => {
    vi.mocked(createPublicClient).mockReturnValue(
      mockPublicClient([
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [DEFAULT_ADMIN_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: true,
        },
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [VOTER_MANAGER_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: false,
        },
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [RECIPIENT_MANAGER_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: false,
        },
      ]) as unknown as ReturnType<typeof createPublicClient>,
    );
    const result = await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("(c) on-chain VOTER_MANAGER_ROLE true → true", async () => {
    vi.mocked(createPublicClient).mockReturnValue(
      mockPublicClient([
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [DEFAULT_ADMIN_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: false,
        },
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [VOTER_MANAGER_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: true,
        },
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [RECIPIENT_MANAGER_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: false,
        },
      ]) as unknown as ReturnType<typeof createPublicClient>,
    );
    const result = await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("(d) on-chain RECIPIENT_MANAGER_ROLE true → true", async () => {
    vi.mocked(createPublicClient).mockReturnValue(
      mockPublicClient([
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [DEFAULT_ADMIN_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: false,
        },
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [VOTER_MANAGER_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: false,
        },
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          args: [RECIPIENT_MANAGER_ROLE, TEST_OUTSIDER_ADDRESS],
          returnValue: true,
        },
      ]) as unknown as ReturnType<typeof createPublicClient>,
    );
    const result = await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("(e) no DB row and all on-chain roles false → false", async () => {
    const result = await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("(f) second call with same args does not call readContract again (cache hit)", async () => {
    const client = mockPublicClient([
      {
        address: TEST_COUNCIL_ADDRESS,
        functionName: "hasRole",
        returnValue: false,
      },
    ]);
    vi.mocked(createPublicClient).mockReturnValue(
      client as unknown as ReturnType<typeof createPublicClient>,
    );

    await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_OUTSIDER_ADDRESS,
    );
    const callCountAfterFirst = (client.readContract as ReturnType<typeof vi.fn>).mock.calls.length;

    await isAdmin(
      fixture.roundId,
      TEST_CHAIN_ID,
      TEST_COUNCIL_ADDRESS,
      TEST_OUTSIDER_ADDRESS,
    );
    const callCountAfterSecond = (client.readContract as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(callCountAfterSecond).toBe(callCountAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// canReadChannel
// ---------------------------------------------------------------------------

describe("canReadChannel", () => {
  it("PUBLIC_ROUND + null address → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "PUBLIC_ROUND",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      null,
    );
    expect(result).toBe(true);
  });

  it("PUBLIC_PROJECT + null address → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "PUBLIC_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        projectId: fixture.alphaProjectId,
      },
      null,
    );
    expect(result).toBe(true);
  });

  it("INTERNAL_APPLICATION + on-chain role → true", async () => {
    vi.mocked(createPublicClient).mockReturnValue(
      mockPublicClient([
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          returnValue: true,
        },
      ]) as unknown as ReturnType<typeof createPublicClient>,
    );
    const result = await canReadChannel(
      {
        channelType: "INTERNAL_APPLICATION",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        applicationId: fixture.acceptedApplicationId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("INTERNAL_APPLICATION + no on-chain role → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "INTERNAL_APPLICATION",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        applicationId: fixture.acceptedApplicationId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("non-public channel + null address → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      null,
    );
    expect(result).toBe(false);
  });

  it("GROUP_ANNOUNCEMENTS for accepted grantee (TEST_OTHER_MANAGER_ADDRESS) → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OTHER_MANAGER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_ANNOUNCEMENTS for outsider (not grantee, not admin) → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_PROJECT for project manager → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_MANAGER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_PROJECT for non-manager non-admin → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_APPLICANTS for admin → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_APPLICANTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_APPLICANTS for non-admin → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_APPLICANTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_GRANTEES for admin → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_GRANTEES",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_GRANTEES for non-admin → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_GRANTEES",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_ROUND_ADMINS for admin → true", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_ROUND_ADMINS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_ROUND_ADMINS for non-admin → false", async () => {
    const result = await canReadChannel(
      {
        channelType: "GROUP_ROUND_ADMINS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canWriteChannel
// ---------------------------------------------------------------------------

describe("canWriteChannel", () => {
  it("INTERNAL_APPLICATION requires on-chain role — role present → true", async () => {
    vi.mocked(createPublicClient).mockReturnValue(
      mockPublicClient([
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          returnValue: true,
        },
      ]) as unknown as ReturnType<typeof createPublicClient>,
    );
    const result = await canWriteChannel(
      {
        channelType: "INTERNAL_APPLICATION",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("INTERNAL_APPLICATION requires on-chain role — no role → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "INTERNAL_APPLICATION",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_PROJECT for project manager → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_MANAGER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_PROJECT for admin → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_PROJECT for non-manager non-admin → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("PUBLIC_PROJECT requires project manager — manager → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "PUBLIC_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        projectId: fixture.alphaProjectId,
      },
      TEST_MANAGER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("PUBLIC_PROJECT requires project manager — non-manager → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "PUBLIC_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        projectId: fixture.alphaProjectId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_ANNOUNCEMENTS requires admin — admin → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_ANNOUNCEMENTS requires admin — non-admin → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("PUBLIC_ROUND requires admin — admin → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "PUBLIC_ROUND",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("PUBLIC_ROUND requires admin — non-admin → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "PUBLIC_ROUND",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_APPLICANTS requires admin — admin → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_APPLICANTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_APPLICANTS requires admin — non-admin → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_APPLICANTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_GRANTEES requires admin — admin → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_GRANTEES",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_GRANTEES requires admin — non-admin → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_GRANTEES",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_ROUND_ADMINS requires admin — admin → true", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_ROUND_ADMINS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_ROUND_ADMINS requires admin — non-admin → false", async () => {
    const result = await canWriteChannel(
      {
        channelType: "GROUP_ROUND_ADMINS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canModerateChannel
// ---------------------------------------------------------------------------

describe("canModerateChannel", () => {
  it("PUBLIC_PROJECT requires project manager — manager → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "PUBLIC_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        projectId: fixture.alphaProjectId,
      },
      TEST_MANAGER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("PUBLIC_PROJECT requires project manager — non-manager → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "PUBLIC_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        projectId: fixture.alphaProjectId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("PUBLIC_ROUND requires admin — admin → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "PUBLIC_ROUND",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("PUBLIC_ROUND requires admin — non-admin → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "PUBLIC_ROUND",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_ANNOUNCEMENTS requires admin — admin → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_ANNOUNCEMENTS requires admin — non-admin → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_ANNOUNCEMENTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_PROJECT requires admin — admin → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_PROJECT requires admin — non-admin → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_PROJECT",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
        projectId: fixture.alphaProjectId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_APPLICANTS requires admin — admin → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_APPLICANTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_APPLICANTS requires admin — non-admin → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_APPLICANTS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_GRANTEES requires admin — admin → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_GRANTEES",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_GRANTEES requires admin — non-admin → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_GRANTEES",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("GROUP_ROUND_ADMINS requires admin — admin → true", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_ROUND_ADMINS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_ADMIN_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("GROUP_ROUND_ADMINS requires admin — non-admin → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "GROUP_ROUND_ADMINS",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
        roundId: fixture.roundId,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });

  it("INTERNAL_APPLICATION requires on-chain role — role present → true", async () => {
    vi.mocked(createPublicClient).mockReturnValue(
      mockPublicClient([
        {
          address: TEST_COUNCIL_ADDRESS,
          functionName: "hasRole",
          returnValue: true,
        },
      ]) as unknown as ReturnType<typeof createPublicClient>,
    );
    const result = await canModerateChannel(
      {
        channelType: "INTERNAL_APPLICATION",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(true);
  });

  it("INTERNAL_APPLICATION requires on-chain role — no role → false", async () => {
    const result = await canModerateChannel(
      {
        channelType: "INTERNAL_APPLICATION",
        chainId: TEST_CHAIN_ID,
        councilId: TEST_COUNCIL_ADDRESS,
      },
      TEST_OUTSIDER_ADDRESS,
    );
    expect(result).toBe(false);
  });
});
