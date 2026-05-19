import { performUnsubscribe } from "../core";

export const dynamic = "force-dynamic";

// RFC 8058 one-click unsubscribe endpoint. Mail clients (Gmail, Apple
// Mail, Outlook) POST here directly server-to-server when the user taps
// the native "Unsubscribe" affordance, driven by the `List-Unsubscribe`
// and `List-Unsubscribe-Post` headers set in ses.ts. `address` and
// `token` travel in the query string; the POST body is the fixed
// `List-Unsubscribe=One-Click` form field.
//
// This path takes no user confirmation — that is the point of one-click —
// so it is deliberately separate from the body-link flow on
// /preferences?action=unsubscribe, which now renders a confirmation card.

const MAX_BODY_SIZE = 1_000;

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const token = searchParams.get("token");

    if (!address || !token) {
      return textResponse("Missing address or token", 400);
    }

    // Per RFC 8058 the body is `List-Unsubscribe=One-Click`. We read it
    // defensively (size-capped) and verify the marker so arbitrary POSTs
    // to this URL don't trigger an unsubscribe.
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return textResponse("Payload too large", 413);
    }
    const params = new URLSearchParams(rawBody);
    if (params.get("List-Unsubscribe") !== "One-Click") {
      return textResponse("Invalid one-click request", 400);
    }

    const result = await performUnsubscribe(address, token);
    if (!result.ok) {
      // Mail clients don't surface the body; the status is what matters.
      return textResponse(result.error, result.status);
    }

    return textResponse("Unsubscribed");
  } catch (err) {
    console.error(err);
    return textResponse("Server error", 500);
  }
}
