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
        application: {
          ...application,
          details: application.details
            ? typeof application.details === "string"
              ? JSON.parse(application.details)
              : application.details
            : null,
        },
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
      details: JSON.stringify(details),
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

    return new Response(
      JSON.stringify({
        success: true,
        application: {
          ...updatedApplication,
          details: updatedApplication.details
            ? typeof updatedApplication.details === "string"
              ? JSON.parse(updatedApplication.details as string)
              : updatedApplication.details
            : null,
        },
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to update application" }),
    );
  }
}
