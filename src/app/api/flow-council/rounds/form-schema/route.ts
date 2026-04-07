import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { findRoundByCouncil, isAdmin } from "../../auth";
import { validateFormSchema } from "../../validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const flowCouncilAddress = searchParams.get("flowCouncilAddress");

    if (!chainId || !flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid parameters" }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select(["details"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const details =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    return new Response(
      JSON.stringify({
        success: true,
        formSchema: details.formSchema ?? null,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch form schema" }),
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const { chainId, flowCouncilAddress, formSchema } = await request.json();

    if (!chainId || !flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid parameters" }),
      );
    }

    const round = await findRoundByCouncil(chainId, flowCouncilAddress);

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const authorized = await isAdmin(
      round.id,
      chainId,
      flowCouncilAddress,
      session.address,
    );

    if (!authorized) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    const validation = validateFormSchema(formSchema);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
      );
    }

    // Read-merge-write to preserve other details keys
    const existingRound = await db
      .selectFrom("rounds")
      .select("details")
      .where("id", "=", round.id)
      .executeTakeFirst();

    const existingDetails =
      typeof existingRound?.details === "string"
        ? JSON.parse(existingRound.details)
        : (existingRound?.details ?? {});

    const mergedDetails = { ...existingDetails, formSchema: validation.data };

    await db
      .updateTable("rounds")
      .set({
        details: JSON.stringify(mergedDetails),
        updatedAt: new Date(),
      })
      .where("id", "=", round.id)
      .execute();

    // Check if applications exist for the warning banner
    const applicationCount = await db
      .selectFrom("applications")
      .select(db.fn.countAll().as("count"))
      .where("roundId", "=", round.id)
      .executeTakeFirst();

    const hasApplications = Number(applicationCount?.count ?? 0) > 0;

    return new Response(
      JSON.stringify({
        success: true,
        formSchema: validation.data,
        hasApplications,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to save form schema" }),
    );
  }
}
