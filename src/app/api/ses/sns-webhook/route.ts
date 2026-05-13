import MessageValidator from "sns-validator";
import { sql } from "kysely";
import { db } from "@/app/api/flow-council/db";

// SECURITY: this endpoint accepts unauthenticated traffic. Every payload
// MUST pass `sns-validator`'s signature check before we touch the DB.
// `sns-validator` restricts the SigningCertURL host to
// `sns.<region>.amazonaws.com(.cn)?`, preventing SSRF via a forged cert URL.
// Skipping or weakening this check converts the endpoint into a DoS-against-
// users tool (anyone could mark arbitrary emails as suspended).
const validator = new MessageValidator();

export const dynamic = "force-dynamic";

type SnsEnvelope = {
  Type?: string;
  SubscribeURL?: string;
  Message?: string;
  [key: string]: unknown;
};

type SesEvent = {
  eventType?: string;
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: Array<{ emailAddress?: string }>;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
  };
};

function ok(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validateSignature(payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    validator.validate(payload, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function suspendEmail(
  email: string,
  reason: "hard_bounce" | "complaint",
) {
  await db
    .updateTable("userProfiles")
    .set({
      emailSuspendedAt: sql`now()`,
      emailSuspensionReason: reason,
    })
    .where("email", "=", email)
    .where("emailSuspendedAt", "is", null)
    .execute();
}

export async function POST(request: Request) {
  // 1. Read body as text. SNS sends Content-Type: text/plain with JSON body.
  const raw = await request.text();

  // 2. Parse JSON.
  let payload: SnsEnvelope;
  try {
    payload = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return ok({ ok: false, error: "Invalid JSON" }, 400);
  }

  // 3. Verify signature BEFORE any side effect. Forged messages stop here.
  try {
    await validateSignature(payload as unknown as Record<string, unknown>);
  } catch {
    return ok({ ok: false, error: "Invalid signature" }, 403);
  }

  // 4. Branch on payload.Type.
  const type = payload.Type;

  if (type === "SubscriptionConfirmation" || type === "UnsubscribeConfirmation") {
    if (typeof payload.SubscribeURL === "string") {
      // Restrict the outbound fetch host to AWS SNS regional endpoints.
      // Without this, a verified-but-attacker-shaped payload could direct us
      // to fetch any URL, including internal services / instance metadata.
      const allowedHost = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;
      try {
        const url = new URL(payload.SubscribeURL);
        if (url.protocol !== "https:" || !allowedHost.test(url.hostname)) {
          console.error(
            "[sns-webhook] Rejected SubscribeURL with disallowed host",
            url.hostname,
          );
          return ok({ ok: false, error: "Invalid SubscribeURL" }, 400);
        }
        await fetch(url.toString());
      } catch (err) {
        console.error("[sns-webhook] Failed to confirm subscription", err);
      }
    }
    return ok();
  }

  if (type === "Notification") {
    let inner: SesEvent;
    try {
      inner =
        typeof payload.Message === "string"
          ? (JSON.parse(payload.Message) as SesEvent)
          : ({} as SesEvent);
    } catch {
      // Malformed inner message — acknowledge to prevent SNS retry storms.
      console.error("[sns-webhook] Could not parse Notification.Message");
      return ok();
    }

    const eventType = inner.eventType;

    if (eventType === "Bounce" && inner.bounce?.bounceType === "Permanent") {
      const recipients = inner.bounce?.bouncedRecipients ?? [];
      for (const r of recipients) {
        if (typeof r?.emailAddress === "string" && r.emailAddress.length > 0) {
          await suspendEmail(r.emailAddress, "hard_bounce");
        }
      }
      return ok();
    }

    if (eventType === "Complaint") {
      const recipients = inner.complaint?.complainedRecipients ?? [];
      for (const r of recipients) {
        if (typeof r?.emailAddress === "string" && r.emailAddress.length > 0) {
          await suspendEmail(r.emailAddress, "complaint");
        }
      }
      return ok();
    }

    // Soft bounces, delivery events, etc. — log and ack.
    console.log("[sns-webhook] Skipping eventType", eventType);
    return ok();
  }

  // 5. Unknown SNS Type — ack so SNS does not retry indefinitely.
  return ok();
}
