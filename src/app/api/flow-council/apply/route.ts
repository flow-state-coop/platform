import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import {
  sendApplicationSubmittedEmail,
  getProjectAndRoundDetails,
} from "../email";
import { errorResponse } from "../../utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { projectId, chainId, councilId, fundingAddress } =
      await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    if (!fundingAddress || !isAddress(fundingAddress)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid funding address" }),
      );
    }

    if (!projectId || typeof projectId !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid project ID" }),
      );
    }

    const isManager = await db
      .selectFrom("projectManagers")
      .select("id")
      .where("projectId", "=", projectId)
      .where("managerAddress", "=", session.address.toLowerCase())
      .executeTakeFirst();

    if (!isManager) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not authorized to apply with this project",
        }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const existingApplication = await db
      .selectFrom("applications")
      .select(["id", "status"])
      .where("projectId", "=", projectId)
      .where("roundId", "=", round.id)
      .executeTakeFirst();

    // Check if another application in the same round already uses this funding address
    const duplicateFundingAddress = await db
      .selectFrom("applications")
      .select("id")
      .where("roundId", "=", round.id)
      .where("fundingAddress", "=", fundingAddress.toLowerCase())
      .where("projectId", "!=", projectId)
      .executeTakeFirst();

    if (duplicateFundingAddress) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "This funding address is already used by another application in this round",
        }),
      );
    }

    let applicationCreated = false;

    if (!existingApplication) {
      await db
        .insertInto("applications")
        .values({
          projectId,
          roundId: round.id,
          fundingAddress: fundingAddress.toLowerCase(),
          status: "SUBMITTED",
        })
        .execute();
      applicationCreated = true;
    } else if (
      existingApplication.status === "REJECTED" ||
      existingApplication.status === "REMOVED"
    ) {
      await db
        .updateTable("applications")
        .set({
          fundingAddress: fundingAddress.toLowerCase(),
          status: "SUBMITTED",
          updatedAt: new Date(),
        })
        .where("id", "=", existingApplication.id)
        .execute();
      applicationCreated = true;
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application already exists for this project and round",
        }),
      );
    }

    // Send email notification to admins (non-blocking)
    if (applicationCreated) {
      const baseUrl = new URL(request.url).origin;
      getProjectAndRoundDetails(projectId, round.id)
        .then((details) => {
          if (details) {
            return sendApplicationSubmittedEmail({
              baseUrl,
              projectName: details.projectName,
              roundName: details.roundName,
              chainId: details.chainId,
              councilId: details.councilId,
            });
          }
        })
        .catch((err) => console.error("Failed to send submission email:", err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Application submitted successfully",
      }),
    );
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
