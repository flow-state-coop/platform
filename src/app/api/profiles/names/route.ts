import { isAddress } from "viem";
import { fetchDisplayNames } from "../../enrichment";
import { errorResponse } from "../../utils";
import { allowRequest, clientIdentifier } from "../../rateLimit";

const MAX_ADDRESSES = 500;

// No credential to key on, so this is limited by origin like the splitter status
// route. Higher than that route's budget because one table renders its names in
// parallel chunks of 150: a page of a few thousand voters is ten requests at
// once, and the window has to fit several page loads rather than one.
const NAMES_REQUEST_LIMIT = 120;
const NAMES_REQUEST_WINDOW_MS = 60_000;

// POST (not GET) so the address list travels in the body: a full page of
// checksummed addresses is several KB, past the URL-length limits some
// CDNs/proxies enforce.
export async function POST(request: Request) {
  try {
    // Before the body is read, because the work being protected is a database
    // query with an IN clause of up to 500 addresses, on a route anyone can
    // call. Unauthenticated and uncapped, a loop here is a database outage.
    if (
      !allowRequest(
        "profile-names",
        clientIdentifier(request.headers),
        NAMES_REQUEST_LIMIT,
        NAMES_REQUEST_WINDOW_MS,
      )
    ) {
      return errorResponse("Too many requests, please retry in a moment", 429);
    }

    const body = await request.json().catch(() => null);
    const raw: unknown = body?.addresses;

    const addresses = Array.isArray(raw)
      ? raw.map((a) => String(a).trim()).filter((a) => a.length > 0)
      : [];

    if (addresses.length === 0) {
      return Response.json({ success: true, names: {} });
    }

    if (addresses.length > MAX_ADDRESSES) {
      return errorResponse(
        `At most ${MAX_ADDRESSES} addresses per request`,
        400,
      );
    }

    if (!addresses.every((a) => isAddress(a))) {
      return errorResponse("Invalid address in list", 400);
    }

    const names = await fetchDisplayNames(addresses);

    return Response.json({ success: true, names });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
