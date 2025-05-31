import { getServerSession } from "next-auth/next";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { truncateStr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { owner, recipient, chainId, councilId, metadata } =
      await request.json();

    const session = await getServerSession(authOptions);
    const network = networks.find((network) => network.id === chainId);

    if (
      !session?.address ||
      session.address.toLowerCase() !== owner.toLowerCase()
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
      .select("owner")
      .select("chainId")
      .select("councilId")
      .select("status")
      .where("owner", "=", owner.toLowerCase())
      .where("chainId", "=", network.id)
      .where("councilId", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!application) {
      await db
        .insertInto("applications")
        .values({
          owner: owner.toLowerCase(),
          recipient: recipient.toLowerCase(),
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
          recipient: recipient.toLowerCase(),
          status: "PENDING",
        })
        .where("chainId", "=", network.id)
        .where("owner", "=", owner.toLowerCase())
        .where("councilId", "=", councilId.toLowerCase())
        .execute();
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Already added as ${truncateStr(application.owner, 14)}`,
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
