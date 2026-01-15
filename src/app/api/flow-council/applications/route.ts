import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { networks } from "@/lib/networks";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId, councilId } = await request.json();

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

    const applications = await db
      .selectFrom("applications")
      .innerJoin("projects", "applications.projectId", "projects.id")
      .select([
        "applications.id",
        "applications.projectId",
        "applications.roundId",
        "applications.fundingAddress",
        "applications.status",
        "applications.details",
        "projects.details as projectDetails",
      ])
      .where("applications.roundId", "=", round.id)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        applications,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}

// Create or update application draft (for Round tab)
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const { projectId, chainId, councilId, details } = await request.json();

    if (!projectId || typeof projectId !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid project ID" }),
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
      );
    }

    // Find the round
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

    // Check for existing application
    const existingApplication = await db
      .selectFrom("applications")
      .select(["id", "status"])
      .where("projectId", "=", projectId)
      .where("roundId", "=", round.id)
      .executeTakeFirst();

    let application;

    if (existingApplication) {
      // Update existing application
      application = await db
        .updateTable("applications")
        .set({
          details: JSON.stringify(details),
          updatedAt: new Date(),
        })
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
      // Get default funding address from project
      const project = await db
        .selectFrom("projects")
        .select("details")
        .where("id", "=", projectId)
        .executeTakeFirst();

      const projectDetails =
        typeof project?.details === "string"
          ? JSON.parse(project.details)
          : project?.details;

      const fundingAddress =
        projectDetails?.defaultFundingAddress || session.address;

      // Create new application with INCOMPLETE status
      application = await db
        .insertInto("applications")
        .values({
          projectId,
          roundId: round.id,
          fundingAddress: fundingAddress.toLowerCase(),
          status: "INCOMPLETE",
          details: JSON.stringify(details),
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
        application: {
          ...application,
          details: application.details
            ? typeof application.details === "string"
              ? JSON.parse(application.details as string)
              : application.details
            : null,
        },
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to save application" }),
    );
  }
}
