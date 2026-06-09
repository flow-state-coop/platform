import { isAddress } from "viem";
import { fetchDisplayNames } from "../../enrichment";
import { errorResponse } from "../../../utils";

const MAX_ADDRESSES = 500;

// POST (not GET) so the address list travels in the body: a full page of
// checksummed addresses is several KB, past the URL-length limits some
// CDNs/proxies enforce.
export async function POST(request: Request) {
  try {
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
