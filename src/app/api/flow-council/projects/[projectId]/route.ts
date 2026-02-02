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

    // Fetch project with managers
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

    const managerAddresses = managers.map((m) => m.managerAddress);
    const isManager =
      managerAddress &&
      isAddress(managerAddress) &&
      managerAddresses.some(
        (m) => m.toLowerCase() === managerAddress.toLowerCase(),
      );

    // Only include emails for managers
    let managerEmails: string[] = [];
    if (isManager) {
      const emails = await db
        .selectFrom("projectEmails")
        .select("email")
        .where("projectId", "=", Number(projectId))
        .execute();
      managerEmails = emails.map((e) => e.email);
    }

    return new Response(
      JSON.stringify({
        success: true,
        project: {
          ...project,
          managerAddresses,
          managerEmails,
        },
        isManager,
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch project" }),
    );
  }
}
