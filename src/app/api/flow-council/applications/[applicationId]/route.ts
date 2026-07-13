import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import {
  sendApplicationSubmittedEmail,
  getProjectAndRoundDetails,
  resolveRoundAdminRecipients,
  resolveRoundAdminAddresses,
} from "../../email";
import { findRoundByCouncil, isAdmin } from "../../auth";
import { writeInboxItems } from "@/lib/inboxWriter";
import {
  validateDynamicAttestationDetails,
  validateDynamicRoundDetails,
  MAX_DETAILS_SIZE,
} from "../../validation";
import { readJsonBody, PayloadTooLargeError } from "../../../utils";
import { MINIMAL_TEMPLATE } from "@/app/flow-councils/types/formSchema";
import { isDynamicApplicationDetails } from "@/app/flow-councils/utils/legacyFormAdapter";
import { getStoredSection } from "@/app/api/flow-council/utils";
import {
  getMilestoneCounts,
  getMilestoneTypes,
  lockAndRevalidateMilestoneSources,
  MilestoneSourcesConflictError,
  parseMilestoneSources,
  remapMilestoneProgress,
  stripMilestoneSourceIndexes,
} from "@/app/api/flow-council/milestoneSources";

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
        { status: 401, headers: { "Content-Type": "application/json" } },
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
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const appId = parseInt(applicationId, 10);
    if (isNaN(appId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid application ID" }),
      );
    }

    let body: {
      details?: Record<string, unknown>;
      submit?: boolean;
      fundingAddress?: string;
      milestoneSources?: unknown;
    };
    try {
      body = await readJsonBody(request, MAX_DETAILS_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return new Response(
          JSON.stringify({ success: false, error: "Payload too large" }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { details, submit, fundingAddress } = body;
    const rawMilestoneSources = body.milestoneSources;

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
        "applications.details as storedDetails",
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

    // Set only when the request carries details, i.e. when the milestone arrays
    // can have moved and progress may need to follow them.
    let milestoneRemap: {
      isDynamicFlow: boolean;
      milestoneTypes: string[];
      submittedCounts: Record<string, number>;
    } | null = null;

    if (details) {
      const roundRow = await db
        .selectFrom("rounds")
        .select("details")
        .where("id", "=", existingApp.roundId)
        .executeTakeFirst();

      const roundDetails =
        typeof roundRow?.details === "string"
          ? JSON.parse(roundRow.details)
          : (roundRow?.details ?? {});

      // Configured formSchema wins; otherwise dynamic-shaped submissions
      // (carrying _formVersion) validate against the default Minimal template.
      const roundSchema =
        roundDetails.formSchema?.round ??
        (isDynamicApplicationDetails(details) ? MINIMAL_TEMPLATE.round : null);
      const attestationSchema =
        roundDetails.formSchema?.attestation ??
        (isDynamicApplicationDetails(details)
          ? MINIMAL_TEMPLATE.attestation
          : null);

      if (roundSchema) {
        const validation = validateDynamicRoundDetails(
          details,
          roundSchema,
          getStoredSection(existingApp.storedDetails, "round"),
        );
        if (!validation.success) {
          return new Response(
            JSON.stringify({ success: false, error: validation.error }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      if (attestationSchema) {
        const validation = validateDynamicAttestationDetails(
          details,
          attestationSchema,
          getStoredSection(existingApp.storedDetails, "attestation"),
        );
        if (!validation.success) {
          return new Response(
            JSON.stringify({ success: false, error: validation.error }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      const isDynamicFlow = !!roundSchema;
      const milestoneTypes = getMilestoneTypes(isDynamicFlow, roundSchema);
      stripMilestoneSourceIndexes(details, isDynamicFlow, milestoneTypes);
      const storedDetails =
        typeof existingApp.storedDetails === "string"
          ? JSON.parse(existingApp.storedDetails)
          : existingApp.storedDetails;
      const submittedCounts = getMilestoneCounts(
        details,
        isDynamicFlow,
        milestoneTypes,
      );
      const parsedSources = parseMilestoneSources(
        rawMilestoneSources,
        getMilestoneCounts(storedDetails, isDynamicFlow, milestoneTypes),
        submittedCounts,
      );
      if (!parsedSources.success) {
        return new Response(
          JSON.stringify({ success: false, error: parsedSources.error }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      milestoneRemap = { isDynamicFlow, milestoneTypes, submittedCounts };
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

    let updatedApplication;
    try {
      updatedApplication = await db.transaction().execute(async (trx) => {
        const remap = milestoneRemap
          ? await lockAndRevalidateMilestoneSources(
              trx,
              appId,
              rawMilestoneSources,
              milestoneRemap.isDynamicFlow,
              milestoneRemap.milestoneTypes,
              milestoneRemap.submittedCounts,
            )
          : null;

        const updated = await trx
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

        if (remap) {
          await remapMilestoneProgress(
            trx,
            appId,
            remap.sources,
            remap.storedCounts,
          );
        }

        return updated;
      });
    } catch (err) {
      if (err instanceof MilestoneSourcesConflictError) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "This application changed while you were saving. Reload and try again.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

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

      // Send email notification to round admins + write inbox items (non-blocking)
      if (details) {
        const baseUrl = new URL(request.url).origin;
        const roundId = updatedApplication.roundId;
        Promise.all([
          resolveRoundAdminRecipients(roundId, "application_eligibility"),
          resolveRoundAdminAddresses(roundId),
        ])
          .then(([recipients, addresses]) =>
            Promise.all([
              sendApplicationSubmittedEmail(recipients, {
                baseUrl,
                projectName: details.projectName,
                roundName: details.roundName,
                chainId: details.chainId,
                councilId: details.councilId,
              }),
              writeInboxItems(
                addresses.map((address) => ({
                  recipientAddress: address,
                  category: "application_eligibility",
                  sourceLabel: details.roundName,
                  snippet: `${details.projectName} submitted their application for review`,
                  applicationId: appId,
                })),
              ),
            ]),
          )
          .catch((err: unknown) =>
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
