import { db } from "../db";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId, councilId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const applications = await db
      .selectFrom("applications")
      .select("owner")
      .select("recipient")
      .select("chainId")
      .select("councilId")
      .select("metadata")
      .select("status")
      .where("chainId", "=", chainId)
      .where("councilId", "=", councilId.toLowerCase())
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        applications,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
