import { db } from "../db";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const contributors = await db
      .selectFrom("contributors")
      .select("name")
      .select("address")
      .select("score")
      .where("chainId", "=", network.id)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        contributors,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
