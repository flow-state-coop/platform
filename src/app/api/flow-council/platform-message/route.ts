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
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (
    providedBuf.length !== secretBuf.length ||
    !crypto.timingSafeEqual(providedBuf, secretBuf)
  ) {
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

    await sendPlatformMessageEmail(recipients, {
      baseUrl,
      subject,
      content,
    });

    await writeInboxItems(
      recipients.map((r) => ({
        recipientAddress: r.address,
        category: "platform" as const,
        sourceLabel: "Flow State",
        snippet: subject,
      })),
    );

    return Response.json({ success: true, recipientCount: recipients.length });
  } catch (error) {
    console.error("Failed to send platform message:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
