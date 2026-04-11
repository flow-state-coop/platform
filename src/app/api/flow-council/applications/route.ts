import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { networks } from "@/lib/networks";
import { authOptions } from "../../auth/[...nextauth]/route";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import {
  validateRoundDetails,
  validateDynamicRoundDetails,
  MAX_DETAILS_SIZE,
} from "../validation";
import { isRoundAdmin, hasOnChainRole } from "../auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        { status: 401 },
      );
    }

    const { chainId, councilId, mode } = await request.json();
    const isListMode = mode === "list";

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

    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(JSON.stringify({ success: true, applications: [] }));
    }

    const userAddress = session.address.toLowerCase();

    const [dbAdmin, onChainAdmin] = await Promise.all([
      isRoundAdmin(round.id, userAddress),
      hasOnChainRole(chainId, councilId, userAddress),
    ]);

    const admin = dbAdmin || onChainAdmin;

    let applications;

    const listColumns = [
      "applications.id",
      "applications.projectId",
      "applications.fundingAddress",
      "applications.status",
      "applications.editsUnlocked",
      "projects.details as projectDetails",
    ] as const;

    const fullColumns = [
      ...listColumns,
      "applications.roundId",
      "applications.details",
    ] as const;

    const columns = isListMode ? listColumns : fullColumns;

    if (admin) {
      applications = await db
        .selectFrom("applications")
        .innerJoin("projects", "applications.projectId", "projects.id")
        .select([...columns])
        .where("applications.roundId", "=", round.id)
        .execute();
    } else {
      const managedProjects = await db
        .selectFrom("projectManagers")
        .select("projectId")
        .where("managerAddress", "=", userAddress)
        .execute();

      const managedProjectIds = managedProjects.map((p) => p.projectId);

      if (managedProjectIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, applications: [] }),
        );
      }

      applications = await db
        .selectFrom("applications")
        .innerJoin("projects", "applications.projectId", "projects.id")
        .select([...columns])
        .where("applications.roundId", "=", round.id)
        .where("applications.projectId", "in", managedProjectIds)
        .execute();
    }

    if (isListMode) {
      const listApplications = applications.map((app) => {
        const projectDetails =
          typeof app.projectDetails === "string"
            ? JSON.parse(app.projectDetails)
            : app.projectDetails;

        return {
          id: app.id,
          projectId: app.projectId,
          fundingAddress: app.fundingAddress,
          status: app.status,
          editsUnlocked: app.editsUnlocked,
          projectDetails: projectDetails ? { name: projectDetails.name } : null,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          applications: listApplications,
        }),
      );
    }

    const projectIds = [...new Set(applications.map((a) => a.projectId))];

    const [managerAddresses, managerEmails] = await Promise.all([
      db
        .selectFrom("projectManagers")
        .select(["projectId", "managerAddress"])
        .where("projectId", "in", projectIds.length > 0 ? projectIds : [0])
        .execute(),
      db
        .selectFrom("projectEmails")
        .select(["projectId", "email"])
        .where("projectId", "in", projectIds.length > 0 ? projectIds : [0])
        .execute(),
    ]);

    const managerAddressesByProject: Record<number, string[]> = {};
    const managerEmailsByProject: Record<number, string[]> = {};

    for (const m of managerAddresses) {
      if (!managerAddressesByProject[m.projectId]) {
        managerAddressesByProject[m.projectId] = [];
      }
      managerAddressesByProject[m.projectId].push(m.managerAddress);
    }

    for (const e of managerEmails) {
      if (!managerEmailsByProject[e.projectId]) {
        managerEmailsByProject[e.projectId] = [];
      }
      managerEmailsByProject[e.projectId].push(e.email);
    }

    const enrichedApplications = applications.map((app) => ({
      ...app,
      managerAddresses: managerAddressesByProject[app.projectId] || [],
      managerEmails: managerEmailsByProject[app.projectId] || [],
    }));

    return new Response(
      JSON.stringify({
        success: true,
        applications: enrichedApplications,
      }),
    );
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}

// Create or update application draft (for Round tab)
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    let body: {
      projectId: number;
      chainId: number;
      councilId: string;
      details?: Record<string, unknown>;
      fundingAddress?: string;
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
    const { projectId, chainId, councilId, details, fundingAddress } = body;

    if (!projectId || typeof projectId !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid project ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const network = networks.find((network) => network.id === chainId);
    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify user is a manager of the project
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
          error: "Not authorized to update this project",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select(["id", "applicationsClosed", "details"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const roundDetails =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    const isDynamicFlow = !!roundDetails.formSchema?.round;

    if (isDynamicFlow) {
      if (
        !fundingAddress ||
        typeof fundingAddress !== "string" ||
        !isAddress(fundingAddress)
      ) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid funding address" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (details) {
      if (isDynamicFlow) {
        const validation = validateDynamicRoundDetails(
          details,
          roundDetails.formSchema.round,
        );
        if (!validation.success) {
          return new Response(
            JSON.stringify({ success: false, error: validation.error }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      } else {
        const validation = validateRoundDetails(details);
        if (!validation.success) {
          return new Response(
            JSON.stringify({ success: false, error: validation.error }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    }

    const existingApplication = await db
      .selectFrom("applications")
      .select(["id", "status", "editsUnlocked"])
      .where("projectId", "=", projectId)
      .where("roundId", "=", round.id)
      .executeTakeFirst();

    const LOCKED_STATUSES = ["ACCEPTED", "GRADUATED", "REMOVED"];
    if (
      existingApplication &&
      LOCKED_STATUSES.includes(existingApplication.status) &&
      !existingApplication.editsUnlocked
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application is locked and cannot be edited",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    let application;

    if (existingApplication) {
      const updateValues: Record<string, unknown> = {
        details: details,
        updatedAt: new Date(),
      };

      const isStatusLocked = LOCKED_STATUSES.includes(
        existingApplication.status,
      );
      if (isDynamicFlow && !isStatusLocked && fundingAddress) {
        updateValues.fundingAddress = fundingAddress.toLowerCase();
      }

      application = await db
        .updateTable("applications")
        .set(updateValues)
        .where("id", "=", existingApplication.id)
        .returning([
          "id",
          "projectId",
          "roundId",
          "fundingAddress",
          "status",
          "details",
        ])
        .executeTakeFirstOrThrow();
    } else {
      if (round.applicationsClosed) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Applications are currently closed",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }

      let insertFundingAddress: string;
      if (isDynamicFlow) {
        insertFundingAddress = (fundingAddress as string).toLowerCase();
      } else {
        const project = await db
          .selectFrom("projects")
          .select("details")
          .where("id", "=", projectId)
          .executeTakeFirst();

        const projectDetails =
          typeof project?.details === "string"
            ? JSON.parse(project.details)
            : project?.details;

        insertFundingAddress = (
          projectDetails?.defaultFundingAddress || session.address
        ).toLowerCase();
      }

      application = await db
        .insertInto("applications")
        .values({
          projectId,
          roundId: round.id,
          fundingAddress: insertFundingAddress,
          status: "INCOMPLETE",
          details: details,
        })
        .returning([
          "id",
          "projectId",
          "roundId",
          "fundingAddress",
          "status",
          "details",
        ])
        .executeTakeFirstOrThrow();
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
      JSON.stringify({ success: false, error: "Failed to save application" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
