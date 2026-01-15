import { isAddress } from "viem";
import { db } from "../../db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const managerAddress = searchParams.get("managerAddress");

    if (!projectId || isNaN(Number(projectId))) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid project ID" }),
      );
    }

    if (!managerAddress || !isAddress(managerAddress)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid manager address" }),
      );
    }

    // Check if the user is a manager of this project
    const isManager = await db
      .selectFrom("projectManagers")
      .select("id")
      .where("projectId", "=", Number(projectId))
      .where("managerAddress", "=", managerAddress.toLowerCase())
      .executeTakeFirst();

    if (!isManager) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not authorized to view this project",
        }),
      );
    }

    // Fetch project with managers and emails
    const project = await db
      .selectFrom("projects")
      .select(["id", "details", "createdAt", "updatedAt"])
      .where("id", "=", Number(projectId))
      .executeTakeFirst();

    if (!project) {
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
      );
    }

    const managers = await db
      .selectFrom("projectManagers")
      .select("managerAddress")
      .where("projectId", "=", Number(projectId))
      .execute();

    const emails = await db
      .selectFrom("projectEmails")
      .select("email")
      .where("projectId", "=", Number(projectId))
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        project: {
          ...project,
          managerAddresses: managers.map((m) => m.managerAddress),
          managerEmails: emails.map((e) => e.email),
        },
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch project" }),
    );
  }
}
