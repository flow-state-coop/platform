import { isAddress } from "viem";
import { fetchDisplayNames } from "../../enrichment";
import { errorResponse } from "../../../utils";

export const revalidate = 60;

const MAX_ADDRESSES = 500;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("addresses") ?? "";

    const addresses = raw
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    if (addresses.length === 0) {
      return new Response(JSON.stringify({ success: true, names: {} }));
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

    return new Response(JSON.stringify({ success: true, names }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
