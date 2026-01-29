import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import {
  sendApplicationSubmittedEmail,
  getProjectAndRoundDetails,
  getRoundAdminEmailsExcludingAddress,
} from "../../email";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    const { applicationId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const appId = parseInt(applicationId, 10);
    if (isNaN(appId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid application ID" }),
      );
    }

    // Verify user is a manager of the project
    const application = await db
      .selectFrom("applications")
      .innerJoin(
        "projectManagers",
        "applications.projectId",
        "projectManagers.projectId",
      )
      .select([
        "applications.id",
        "applications.projectId",
        "applications.roundId",
        "applications.fundingAddress",
        "applications.status",
        "applications.details",
      ])
      .where("applications.id", "=", appId)
      .where(
        "projectManagers.managerAddress",
        "=",
        session.address.toLowerCase(),
      )
      .executeTakeFirst();

    if (!application) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application not found or not authorized",
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        application,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch application" }),
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    const { applicationId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const appId = parseInt(applicationId, 10);
    if (isNaN(appId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid application ID" }),
      );
    }

    const { details, submit, fundingAddress } = await request.json();

    // Verify user is a manager of the project
    const existingApp = await db
      .selectFrom("applications")
      .innerJoin(
        "projectManagers",
        "applications.projectId",
        "projectManagers.projectId",
      )
      .select(["applications.id", "applications.status"])
      .where("applications.id", "=", appId)
      .where(
        "projectManagers.managerAddress",
        "=",
        session.address.toLowerCase(),
      )
      .executeTakeFirst();

    if (!existingApp) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application not found or not authorized",
        }),
      );
    }

    // Build the update object
    const updateData: Record<string, unknown> = {
      details: details,
      updatedAt: new Date(),
    };

    // Update funding address if provided and valid
    if (fundingAddress && typeof fundingAddress === "string") {
      if (!isAddress(fundingAddress)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid funding address",
          }),
        );
      }
      updateData.fundingAddress = fundingAddress.toLowerCase();
    }

    // Change status to SUBMITTED if submit flag is true and current status is INCOMPLETE or CHANGES_REQUESTED
    const canSubmit =
      existingApp.status === "INCOMPLETE" ||
      existingApp.status === "CHANGES_REQUESTED";
    if (submit === true && canSubmit) {
      updateData.status = "SUBMITTED";
    }

    const updatedApplication = await db
      .updateTable("applications")
      .set(updateData)
      .where("id", "=", appId)
      .returning([
        "id",
        "projectId",
        "roundId",
        "fundingAddress",
        "status",
        "details",
      ])
      .executeTakeFirstOrThrow();

    // Insert automated message and send email when application is submitted
    if (submit === true && canSubmit) {
      // Fetch project and round details
      const details = await getProjectAndRoundDetails(
        updatedApplication.projectId,
        updatedApplication.roundId,
      );

      const projectName = details?.projectName || "Project";

      // Insert automated message (System sender: 0x0000...0000)
      await db
        .insertInto("messages")
        .values({
          channelType: "GROUP_PROJECT",
          roundId: updatedApplication.roundId,
          projectId: updatedApplication.projectId,
          applicationId: appId,
          authorAddress: "0x0000000000000000000000000000000000000000",
          content: `${projectName} submitted their application for review`,
        })
        .execute();

      // Send email notification to round admins (non-blocking)
      if (details) {
        const baseUrl = new URL(request.url).origin;
        getRoundAdminEmailsExcludingAddress(updatedApplication.roundId)
          .then((recipients) =>
            sendApplicationSubmittedEmail(recipients, {
              baseUrl,
              projectName: details.projectName,
              roundName: details.roundName,
              chainId: details.chainId,
              councilId: details.councilId,
            }),
          )
          .catch((err) =>
            console.error("Failed to send submission email:", err),
          );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        application: updatedApplication,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to update application" }),
    );
  }
}
