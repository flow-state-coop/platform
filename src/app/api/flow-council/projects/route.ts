import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { validateProjectDetails } from "../validation";

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

    const body = await request.json();
    const { managerAddresses, managerEmails, ...projectDetails } = body;

    const validation = validateProjectDetails(projectDetails);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
      );
    }

    const {
      name,
      description,
      logoUrl,
      bannerUrl,
      website,
      twitter,
      github,
      defaultFundingAddress,
      demoUrl,
      farcaster,
      telegram,
      discord,
      karmaProfile,
      githubRepos,
      smartContracts,
      otherLinks,
    } = validation.data;

    if (defaultFundingAddress && !isAddress(defaultFundingAddress)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid default funding address",
        }),
      );
    }

    // Filter smartContracts to only include valid addresses
    const validSmartContracts = (
      smartContracts as
        | { type: string; network: string; address: string }[]
        | undefined
    )?.filter((c) => !c.address || isAddress(c.address));

    // Validate manager addresses include the session address
    const normalizedManagerAddresses = (
      managerAddresses as string[] | undefined
    )
      ?.filter((a) => a && isAddress(a))
      .map((a) => a.toLowerCase()) ?? [session.address.toLowerCase()];

    if (!normalizedManagerAddresses.includes(session.address.toLowerCase())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Your address must be included as a manager",
        }),
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
            // New fields in details JSON
            defaultFundingAddress,
            demoUrl,
            farcaster,
            telegram,
            discord,
            karmaProfile,
            githubRepos,
            smartContracts: validSmartContracts,
            otherLinks,
          }),
        })
        .returning(["id", "details", "createdAt", "updatedAt"])
        .executeTakeFirstOrThrow();

      // Insert manager addresses
      if (normalizedManagerAddresses.length > 0) {
        await trx
          .insertInto("projectManagers")
          .values(
            normalizedManagerAddresses.map((address) => ({
              projectId: newProject.id,
              managerAddress: address,
            })),
          )
          .execute();
      }

      // Insert manager emails
      const validEmails = (managerEmails as string[] | undefined)?.filter(
        (e) => e && e.includes("@"),
      );
      if (validEmails && validEmails.length > 0) {
        await trx
          .insertInto("projectEmails")
          .values(
            validEmails.map((email) => ({
              projectId: newProject.id,
              email,
              managerAddress: session.address.toLowerCase(),
            })),
          )
          .execute();
      }

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

    const body = await request.json();
    const { projectId, managerAddresses, managerEmails, ...projectDetails } =
      body;

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

    const validation = validateProjectDetails(projectDetails);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
      );
    }

    const {
      name,
      description,
      logoUrl,
      bannerUrl,
      website,
      twitter,
      github,
      defaultFundingAddress,
      demoUrl,
      farcaster,
      telegram,
      discord,
      karmaProfile,
      githubRepos,
      smartContracts,
      otherLinks,
    } = validation.data;

    if (defaultFundingAddress && !isAddress(defaultFundingAddress)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid default funding address",
        }),
      );
    }

    // Filter smartContracts to only include valid addresses
    const validSmartContracts = (
      smartContracts as
        | { type: string; network: string; address: string }[]
        | undefined
    )?.filter((c) => !c.address || isAddress(c.address));

    // Validate manager addresses include the session address
    const normalizedManagerAddresses = (
      managerAddresses as string[] | undefined
    )
      ?.filter((a) => a && isAddress(a))
      .map((a) => a.toLowerCase());

    if (
      normalizedManagerAddresses &&
      !normalizedManagerAddresses.includes(session.address.toLowerCase())
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Your address must be included as a manager",
        }),
      );
    }

    const updatedProject = await db.transaction().execute(async (trx) => {
      const project = await trx
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
            // New fields in details JSON
            defaultFundingAddress,
            demoUrl,
            farcaster,
            telegram,
            discord,
            karmaProfile,
            githubRepos,
            smartContracts: validSmartContracts,
            otherLinks,
          }),
          updatedAt: new Date(),
        })
        .where("id", "=", projectId)
        .returning(["id", "details", "createdAt", "updatedAt"])
        .executeTakeFirstOrThrow();

      // Update manager addresses if provided
      if (normalizedManagerAddresses) {
        // Delete existing managers
        await trx
          .deleteFrom("projectManagers")
          .where("projectId", "=", projectId)
          .execute();

        // Insert new managers
        if (normalizedManagerAddresses.length > 0) {
          await trx
            .insertInto("projectManagers")
            .values(
              normalizedManagerAddresses.map((address) => ({
                projectId,
                managerAddress: address,
              })),
            )
            .execute();
        }
      }

      // Update manager emails if provided
      const validEmails = (managerEmails as string[] | undefined)?.filter(
        (e) => e && e.includes("@"),
      );
      if (validEmails !== undefined) {
        await trx
          .deleteFrom("projectEmails")
          .where("projectId", "=", projectId)
          .execute();

        // Insert new emails
        if (validEmails.length > 0) {
          await trx
            .insertInto("projectEmails")
            .values(
              validEmails.map((email) => ({
                projectId,
                email,
                managerAddress: session.address.toLowerCase(),
              })),
            )
            .execute();
        }
      }

      return project;
    });

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
