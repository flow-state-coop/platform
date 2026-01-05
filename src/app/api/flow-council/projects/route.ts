import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const managerAddress = searchParams.get("managerAddress");

    if (!managerAddress || !isAddress(managerAddress)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid manager address" }),
      );
    }

    const projects = await db
      .selectFrom("projects")
      .innerJoin("projectManagers", "projects.id", "projectManagers.projectId")
      .select([
        "projects.id",
        "projects.details",
        "projects.createdAt",
        "projects.updatedAt",
      ])
      .where(
        "projectManagers.managerAddress",
        "=",
        managerAddress.toLowerCase(),
      )
      .orderBy("projects.updatedAt", "desc")
      .execute();

    return new Response(JSON.stringify({ success: true, projects }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch projects" }),
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const { name, description, logoUrl, bannerUrl, website, twitter, github } =
      await request.json();

    if (!name) {
      return new Response(
        JSON.stringify({ success: false, error: "Project name is required" }),
      );
    }

    const project = await db.transaction().execute(async (trx) => {
      const newProject = await trx
        .insertInto("projects")
        .values({
          details: JSON.stringify({
            name,
            description,
            logoUrl,
            bannerUrl,
            website,
            twitter,
            github,
          }),
        })
        .returning(["id", "details", "createdAt", "updatedAt"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("projectManagers")
        .values({
          projectId: newProject.id,
          managerAddress: session.address.toLowerCase(),
        })
        .execute();

      return newProject;
    });

    return new Response(JSON.stringify({ success: true, project }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to create project" }),
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const {
      projectId,
      name,
      description,
      logoUrl,
      bannerUrl,
      website,
      twitter,
      github,
    } = await request.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: "Project ID is required" }),
      );
    }

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

    const updatedProject = await db
      .updateTable("projects")
      .set({
        details: JSON.stringify({
          name,
          description,
          logoUrl,
          bannerUrl,
          website,
          twitter,
          github,
        }),
        updatedAt: new Date(),
      })
      .where("id", "=", projectId)
      .returning(["id", "details", "createdAt", "updatedAt"])
      .executeTakeFirstOrThrow();

    return new Response(
      JSON.stringify({ success: true, project: updatedProject }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to update project" }),
    );
  }
}
