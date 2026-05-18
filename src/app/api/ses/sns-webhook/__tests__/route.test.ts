/**
 * Manual security test plan — forged signature rejection.
 *
 * The signature-validation path cannot be unit-tested without real AWS
 * certificates (sns-validator fetches the SigningCertURL over HTTPS). Run the
 * following curl checks against a deployed preview before promoting:
 *
 * 1. Forged payload (no signature):
 *    curl -i -X POST "$URL/api/ses/sns-webhook" \
 *      -H "Content-Type: text/plain" \
 *      --data '{"Type":"Notification","Message":"{\"eventType\":\"Bounce\",\"bounce\":{\"bounceType\":\"Permanent\",\"bouncedRecipients\":[{\"emailAddress\":\"victim@example.com\"}]}}"}'
 *    Expected: HTTP 403, victim@example.com NOT suspended in user_profiles.
 *
 * 2. Tampered Signature field:
 *    Take a real captured SNS payload, flip one base64 char in "Signature",
 *    repost. Expected: HTTP 403.
 *
 * 3. Signed but SigningCertURL pointed at attacker host
 *    (e.g. https://evil.example.com/cert.pem). sns-validator rejects on the
 *    hostPattern check before any HTTP fetch. Expected: HTTP 403.
 *
 * 4. Real Permanent bounce delivered via SNS (use SES simulator address
 *    `bounce@simulator.amazonses.com`). Expected: HTTP 200 and the suspended
 *    address has email_suspended_at set + email_suspension_reason='hard_bounce'.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sns-validator", () => ({
  default: class {
    validate(_: unknown, cb: (err: null) => void) {
      cb(null);
    }
  },
}));

vi.mock("@/app/api/flow-council/db", () => {
  const db = {
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  };
  return { db };
});

const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

// Import the route AFTER mocks are registered.
import { POST } from "../route";
import { db } from "@/app/api/flow-council/db";

const dbMock = db as unknown as {
  updateTable: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

function makeRequest(body: string): Request {
  return new Request("http://localhost/api/ses/sns-webhook", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  });
}

describe("POST /api/ses/sns-webhook", () => {
  beforeEach(() => {
    dbMock.updateTable.mockClear();
    dbMock.set.mockClear();
    dbMock.where.mockClear();
    dbMock.execute.mockClear();
    fetchMock.mockClear();
  });

  it("fetches SubscribeURL on SubscriptionConfirmation", async () => {
    const subscribeUrl = "https://sns.us-east-1.amazonaws.com/?Action=Confirm";
    const body = JSON.stringify({
      Type: "SubscriptionConfirmation",
      SubscribeURL: subscribeUrl,
    });

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(subscribeUrl);
    expect(dbMock.updateTable).not.toHaveBeenCalled();
  });

  it("suspends the bounced email on a Permanent Bounce notification", async () => {
    const inner = {
      eventType: "Bounce",
      bounce: {
        bounceType: "Permanent",
        bouncedRecipients: [{ emailAddress: "bouncer@example.com" }],
      },
    };
    const body = JSON.stringify({
      Type: "Notification",
      Message: JSON.stringify(inner),
    });

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    expect(dbMock.updateTable).toHaveBeenCalledWith("userProfiles");
    // emailSuspendedAt IS NULL guard + email = $email
    expect(dbMock.where).toHaveBeenCalledWith(
      "email",
      "=",
      "bouncer@example.com",
    );
    expect(dbMock.where).toHaveBeenCalledWith(
      "emailSuspendedAt",
      "is",
      null,
    );
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it("returns 400 and skips DB writes on invalid JSON", async () => {
    const res = await POST(makeRequest("not json {{{"));

    expect(res.status).toBe(400);
    expect(dbMock.updateTable).not.toHaveBeenCalled();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });
});
