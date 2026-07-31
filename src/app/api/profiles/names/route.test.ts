import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../enrichment", () => ({
  fetchDisplayNames: vi.fn(async () => ({})),
}));

import { POST as namesPost } from "./route";
import { resetRateLimits } from "@/app/api/rateLimit";

const ADDRESS = "0x000000000000000000000000000000000000000a";

function names(addresses: string[], ip = "1.2.3.4") {
  return namesPost(
    new Request("http://localhost/api/profiles/names", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": ip,
      },
      body: JSON.stringify({ addresses }),
    }),
  );
}

beforeEach(() => {
  resetRateLimits();
});

describe("profile names", () => {
  it("refuses a caller looping past the request limit", async () => {
    for (let i = 0; i < 120; i++) {
      expect((await names([ADDRESS])).status).toBe(200);
    }

    // Unauthenticated and one database query per call, so a loop here is a
    // database outage rather than a slow page.
    const res = await names([ADDRESS]);

    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("Too many requests");
  });

  it("limits per caller, not globally", async () => {
    for (let i = 0; i < 120; i++) {
      await names([ADDRESS]);
    }

    expect((await names([ADDRESS])).status).toBe(429);
    expect((await names([ADDRESS], "5.6.7.8")).status).toBe(200);
  });

  it("spends the limit before reading the body, so an oversized list still counts", async () => {
    const tooMany = Array.from({ length: 501 }, () => ADDRESS);

    for (let i = 0; i < 120; i++) {
      expect((await names(tooMany)).status).toBe(400);
    }

    expect((await names([ADDRESS])).status).toBe(429);
  });
});
