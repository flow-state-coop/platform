import { getServerSession } from "next-auth/next";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { truncateStr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { address, chainId, councilId, metadata } = await request.json();

    const session = await getServerSession(authOptions);
    const network = networks.find((network) => network.id === chainId);

    if (
      !session?.address ||
      session.address.toLowerCase() !== address.toLowerCase()
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const application = await db
      .selectFrom("applications")
      .select("address")
      .select("chainId")
      .select("councilId")
      .select("status")
      .where("address", "=", address.toLowerCase())
      .where("chainId", "=", network.id)
      .where("councilId", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!application) {
      await db
        .insertInto("applications")
        .values({
          address: address.toLowerCase(),
          chainId: network.id,
          councilId: councilId.toLowerCase(),
          metadata,
          status: "PENDING",
        })
        .execute();
    } else if (application.status !== "PENDING") {
      await db
        .updateTable("applications")
        .set({
          metadata,
          status: "PENDING",
        })
        .where("chainId", "=", network.id)
        .where("address", "=", address.toLowerCase())
        .where("councilId", "=", councilId.toLowerCase())
        .execute();
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Already added as ${truncateStr(application.address, 14)}`,
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Success! Application pending`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
