import { z } from "zod";
import { performUnsubscribe } from "./core";
import { readJsonBody, PayloadTooLargeError } from "../../../utils";

export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 4_000;

const bodySchema = z.object({
  token: z.string().min(1),
  address: z.string().min(1),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await readJsonBody(request, MAX_BODY_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return jsonResponse(
          { success: false, error: "Payload too large" },
          413,
        );
      }
      return jsonResponse(
        { success: false, error: "Invalid request body" },
        400,
      );
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse(
        { success: false, error: "Invalid request body" },
        400,
      );
    }

    const { token, address } = parsed.data;

    const result = await performUnsubscribe(address, token);
    if (!result.ok) {
      return jsonResponse(
        { success: false, error: result.error },
        result.status,
      );
    }

    // Return the rotated token so a page kept open by the user (who just
    // unsubscribed themselves) can still drive follow-up actions, while the
    // link they arrived on is now dead.
    return jsonResponse({ success: true, token: result.token });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
