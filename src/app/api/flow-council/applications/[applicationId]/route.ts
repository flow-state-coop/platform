import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import {
  sendApplicationSubmittedEmail,
  getProjectAndRoundDetails,
  getRoundAdminEmailsExcludingAddress,
} from "../../email";
import { findRoundByCouncil, isAdmin } from "../../auth";
import { validateDynamicAttestationDetails } from "../../validation";

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

    const url = new URL(request.url);
    const chainId = url.searchParams.get("chainId");
    const councilId = url.searchParams.get("councilId");

    const userAddress = session.address.toLowerCase();

    let admin = false;
    let round: { id: number } | undefined;
    if (chainId && councilId && isAddress(councilId)) {
      round = await findRoundByCouncil(Number(chainId), councilId);

      if (round) {
        admin = await isAdmin(
          round.id,
          Number(chainId),
          councilId,
          userAddress,
        );
      }
    }

    let application;

    if (admin && round) {
      application = await db
        .selectFrom("applications")
        .innerJoin("projects", "applications.projectId", "projects.id")
        .select([
          "applications.id",
          "applications.projectId",
          "applications.roundId",
          "applications.fundingAddress",
          "applications.status",
          "applications.details",
          "applications.editsUnlocked",
          "projects.details as projectDetails",
        ])
        .where("applications.id", "=", appId)
        .where("applications.roundId", "=", round.id)
        .executeTakeFirst();
    } else {
      application = await db
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
          "applications.editsUnlocked",
        ])
        .where("applications.id", "=", appId)
        .where("projectManagers.managerAddress", "=", userAddress)
        .executeTakeFirst();
    }

    if (!application) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application not found or not authorized",
        }),
      );
    }

    if (admin) {
      const [managerAddresses, managerEmails] = await Promise.all([
        db
          .selectFrom("projectManagers")
          .select("managerAddress")
          .where("projectId", "=", application.projectId)
          .execute(),
        db
          .selectFrom("projectEmails")
          .select("email")
          .where("projectId", "=", application.projectId)
          .execute(),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          application: {
            ...application,
            managerAddresses: managerAddresses.map((m) => m.managerAddress),
            managerEmails: managerEmails.map((e) => e.email),
          },
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
      .select([
        "applications.id",
        "applications.roundId",
        "applications.status",
        "applications.editsUnlocked",
      ])
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

    const LOCKED_STATUSES = ["ACCEPTED", "GRADUATED", "REMOVED"];
    const isLocked = LOCKED_STATUSES.includes(existingApp.status);

    if (isLocked && !existingApp.editsUnlocked) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application is locked and cannot be edited",
        }),
      );
    }

    if (details && details._formVersion) {
      const roundRow = await db
        .selectFrom("rounds")
        .select("details")
        .where("id", "=", existingApp.roundId)
        .executeTakeFirst();

      const roundDetails =
        typeof roundRow?.details === "string"
          ? JSON.parse(roundRow.details)
          : (roundRow?.details ?? {});

      if (roundDetails.formSchema?.attestation) {
        const validation = validateDynamicAttestationDetails(
          details,
          roundDetails.formSchema.attestation,
        );
        if (!validation.success) {
          return new Response(
            JSON.stringify({ success: false, error: validation.error }),
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {
      details: details,
      updatedAt: new Date(),
    };

    if (!isLocked && fundingAddress && typeof fundingAddress === "string") {
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
