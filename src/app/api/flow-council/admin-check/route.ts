import { isAddress } from "viem";
import { networks } from "@/lib/networks";
import { findRoundByCouncil, isRoundAdmin } from "../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const councilId = searchParams.get("councilId");
    const address = searchParams.get("address");

    if (!networks.find((n) => n.id === chainId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid councilId" }),
      );
    }

    if (!address || !isAddress(address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid address" }),
      );
    }

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return new Response(
        JSON.stringify({ success: true, roundId: null, isAdmin: false }),
      );
    }

    const adminStatus = await isRoundAdmin(round.id, address);

    return new Response(
      JSON.stringify({
        success: true,
        roundId: round.id,
        isAdmin: adminStatus,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error:
          err instanceof Error ? err.message : "Failed to check admin status",
      }),
    );
  }
}
