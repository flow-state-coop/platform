import crypto from "crypto";
import { z } from "zod";
import {
  resolvePlatformRecipients,
  sendPlatformMessageEmail,
} from "@/app/api/flow-council/email";
import { writeInboxItems } from "@/lib/inboxWriter";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  subject: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  baseUrl: z.string().url().optional(),
});

function unauthorized() {
  return Response.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const secret = process.env.PLATFORM_MESSAGE_SECRET;
  if (!secret) {
    console.error("PLATFORM_MESSAGE_SECRET is not configured");
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";
  // Hash both sides first so the comparison is constant-length and
  // constant-time regardless of `provided` length — avoids leaking the
  // secret's length via a short-circuit on length mismatch.
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(providedHash, secretHash)) {
    return unauthorized();
  }

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    parsedBody = bodySchema.parse(json);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invalid request body",
      },
      { status: 400 },
    );
  }

  const { subject, content } = parsedBody;
  const baseUrl = parsedBody.baseUrl ?? new URL(request.url).origin;

  try {
    const recipients = await resolvePlatformRecipients();

    if (recipients.length === 0) {
      return Response.json({ success: true, recipientCount: 0 });
    }

    // Independent side effects — run in parallel so a SES failure doesn't
    // silently drop the inbox writes (and vice versa).
    await Promise.all([
      sendPlatformMessageEmail(recipients, {
        baseUrl,
        subject,
        content,
      }),
      writeInboxItems(
        recipients.map((r) => ({
          recipientAddress: r.address,
          category: "platform" as const,
          sourceLabel: "Flow State",
          snippet: subject,
        })),
      ),
    ]);

    return Response.json({ success: true, recipientCount: recipients.length });
  } catch (error) {
    console.error("Failed to send platform message:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
