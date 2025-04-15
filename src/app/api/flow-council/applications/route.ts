import { db } from "../db";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { address, chainId, councilId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const applications = await db
      .selectFrom("applications")
      .select("address")
      .select("chainId")
      .select("councilId")
      .select("metadata")
      .select("status")
      .where("address", "=", address)
      .where("chainId", "=", chainId)
      .where("councilId", "=", councilId)
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
