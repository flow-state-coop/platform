import { getServerSession } from "next-auth/next";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";

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
    if (
      fundingAddress &&
      typeof fundingAddress === "string" &&
      fundingAddress.startsWith("0x")
    ) {
      updateData.fundingAddress = fundingAddress.toLowerCase();
    }

    // Change status to SUBMITTED if submit flag is true and current status is INCOMPLETE
    if (submit === true && existingApp.status === "INCOMPLETE") {
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

    // Insert automated message when application is submitted
    if (submit === true && existingApp.status === "INCOMPLETE") {
      // Fetch project name
      const project = await db
        .selectFrom("projects")
        .select(["details"])
        .where("id", "=", updatedApplication.projectId)
        .executeTakeFirst();

      const projectDetails =
        typeof project?.details === "string"
          ? JSON.parse(project.details)
          : project?.details;
      const projectName = projectDetails?.name || "Project";

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
