import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { networks } from "@/lib/networks";
import { authOptions } from "../../auth/[...nextauth]/route";
import { hasOnChainRole, findRoundByCouncil } from "../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const councilId = searchParams.get("councilId");

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return new Response(
        JSON.stringify({ success: true, channels: [], isAdmin: false }),
      );
    }

    // Check if user is a round admin (db or on-chain)
    const [roundAdmin, isOnChainAdmin] = await Promise.all([
      db
        .selectFrom("roundAdmins")
        .select("id")
        .where("roundId", "=", round.id)
        .where("adminAddress", "=", session.address.toLowerCase())
        .executeTakeFirst(),
      hasOnChainRole(chainId, councilId, session.address),
    ]);

    const isAdmin = !!roundAdmin || isOnChainAdmin;

    // Check if user has any accepted applications (is a grantee)
    let isGrantee = false;
    if (!isAdmin) {
      const acceptedApplication = await db
        .selectFrom("applications")
        .innerJoin("projects", "applications.projectId", "projects.id")
        .innerJoin(
          "projectManagers",
          "projects.id",
          "projectManagers.projectId",
        )
        .select("applications.id")
        .where("applications.roundId", "=", round.id)
        .where("applications.status", "=", "ACCEPTED")
        .where(
          "projectManagers.managerAddress",
          "=",
          session.address.toLowerCase(),
        )
        .executeTakeFirst();

      isGrantee = !!acceptedApplication;
    }

    const canAccessAnnouncements = isAdmin || isGrantee;

    // Get projects based on user role
    let query = db
      .selectFrom("applications")
      .innerJoin("projects", "applications.projectId", "projects.id")
      .select([
        "projects.id as projectId",
        "projects.details as projectDetails",
        "applications.id as applicationId",
        "applications.roundId",
        "applications.status",
      ])
      .where("applications.roundId", "=", round.id)
      .where("applications.status", "!=", "INCOMPLETE");

    // If not admin, only show user's own projects
    if (!isAdmin) {
      const userProjectIds = await db
        .selectFrom("projectManagers")
        .select("projectId")
        .where("managerAddress", "=", session.address.toLowerCase())
        .execute();

      const projectIds = userProjectIds.map((p) => p.projectId);

      if (projectIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, channels: [], isAdmin }),
        );
      }

      query = query.where("projects.id", "in", projectIds);
    }

    const applications = await query.execute();

    // Transform to channel format
    const channels = applications.map((app) => {
      const projectDetails =
        typeof app.projectDetails === "string"
          ? JSON.parse(app.projectDetails)
          : app.projectDetails;

      return {
        projectId: app.projectId,
        projectName: projectDetails?.name ?? "Unnamed Project",
        applicationId: app.applicationId,
        roundId: app.roundId,
      };
    });

    // Sort by project name
    channels.sort((a, b) => a.projectName.localeCompare(b.projectName));

    return new Response(
      JSON.stringify({
        success: true,
        channels,
        isAdmin,
        canAccessAnnouncements,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to fetch project channels",
      }),
    );
  }
}
