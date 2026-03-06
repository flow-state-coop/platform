import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../../db";
import { networks } from "@/lib/networks";
import { errorResponse } from "../../../utils";
import { findRoundByCouncil } from "../../auth";
import { ProjectDetails, SmartContract } from "@/types/project";
import { ApplicationStatus } from "@/generated/kysely";

export const dynamic = "force-dynamic";

const queryParamsSchema = z.object({
  chainId: z.coerce.number().refine(
    (id) => networks.some((n) => n.id === id),
    "Wrong network",
  ),
  councilId: z.string().refine(isAddress, "Invalid council ID"),
});

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: "Accepted",
  GRADUATED: "Graduated",
  REMOVED: "Removed",
};

const PUBLIC_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.ACCEPTED,
  ApplicationStatus.GRADUATED,
  ApplicationStatus.REMOVED,
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = queryParamsSchema.safeParse({
      chainId: searchParams.get("chainId"),
      councilId: searchParams.get("councilId"),
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return new Response(
        JSON.stringify({ success: false, error: issue.message }),
      );
    }

    const { chainId, councilId } = parsed.data;

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return new Response(JSON.stringify({ success: true, applications: [] }));
    }

    const applications = await db
      .selectFrom("applications")
      .innerJoin("projects", "applications.projectId", "projects.id")
      .select([
        "applications.projectId",
        "applications.fundingAddress",
        "applications.status",
        "projects.details as projectDetails",
      ])
      .where("applications.roundId", "=", round.id)
      .where("applications.status", "in", PUBLIC_STATUSES)
      .execute();

    const publicApplications = applications.map((app) => {
      const details = (
        typeof app.projectDetails === "string"
          ? JSON.parse(app.projectDetails)
          : app.projectDetails
      ) as ProjectDetails | null;

      const smartContracts: SmartContract[] = details?.smartContracts ?? [];

      const projectAddresses = smartContracts
        .filter((sc) => sc.type === "projectAddress")
        .map((sc) => sc.address)
        .join("|");

      const goodCollectivePoolAddresses = smartContracts
        .filter((sc) => sc.type === "goodCollectivePool")
        .map((sc) => sc.address)
        .join("|");

      const githubRepos = [details?.github, ...(details?.githubRepos ?? [])]
        .filter(Boolean)
        .join("|");

      return {
        project_id: app.projectId,
        project_name: details?.name ?? "",
        application_status: STATUS_LABELS[app.status] || app.status,
        status: app.status,
        project_description: details?.description ?? "",
        logo: details?.logoUrl ?? "",
        banner: details?.bannerUrl ?? "",
        funding_address: app.fundingAddress,
        website: details?.website ?? "",
        demo_link: details?.demoUrl ?? "",
        x_handle: details?.twitter ?? "",
        farcaster_handle: details?.farcaster ?? "",
        telegram_group: details?.telegram ?? "",
        discord_channel: details?.discord ?? "",
        karma_gap_link: details?.karmaProfile ?? "",
        gardens_link: details?.gardensPool ?? "",
        github_repos: githubRepos,
        project_addresses: projectAddresses,
        goodcollective_pool_addresses: goodCollectivePoolAddresses,
      };
    });

    return new Response(
      JSON.stringify({ success: true, applications: publicApplications }),
    );
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
