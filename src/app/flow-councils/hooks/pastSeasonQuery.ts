import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { gdaPoolAbi } from "@sfpro/sdk/abi";
import type {
  ArchivedProject,
  PastSeason,
} from "@/app/flow-councils/lib/pastSeasons";

export type PastSeasonProject = ArchivedProject & {
  isOffboarded: boolean;
  totalStreamed: bigint;
};

type PublicApplication = {
  project_id: number;
  project_name: string;
  logo: string;
  funding_address: `0x${string}`;
  status: string;
};

async function fetchSeasonProjects(chainId: number, councilId: string) {
  const params = new URLSearchParams({ chainId: String(chainId), councilId });
  const res = await fetch(`/api/flow-council/applications/public?${params}`);
  const { success, applications, error } = await res.json();

  if (!success) {
    throw new Error(error ?? "Failed to load season projects");
  }

  return (applications as PublicApplication[]).map((application) => ({
    name: application.project_name,
    fundingAddress: application.funding_address,
    logoUrl: application.logo,
    href: `/projects/${application.project_id}`,
    isOffboarded: application.status === "REMOVED",
  }));
}

export default function usePastSeasonQuery(
  chainId: number,
  season: PastSeason,
) {
  const { data: fetchedProjects, isError } = useQuery({
    queryKey: ["pastSeasonProjects", chainId, season.councilAddress],
    queryFn: () => fetchSeasonProjects(chainId, season.councilAddress),
    enabled: !season.archivedProjects,
    staleTime: Infinity,
  });

  const seasonProjects = useMemo(
    () =>
      season.archivedProjects?.map((project) => ({
        ...project,
        isOffboarded: false,
      })) ?? fetchedProjects,
    [season.archivedProjects, fetchedProjects],
  );

  const { data: totals } = useReadContracts({
    contracts: (seasonProjects ?? []).map((project) => ({
      chainId,
      address: season.distributionPool,
      abi: gdaPoolAbi,
      functionName: "getTotalAmountReceivedByMember",
      args: [project.fundingAddress],
    })),
    query: { enabled: !!seasonProjects, staleTime: Infinity },
  });

  const projects = useMemo(() => {
    if (!seasonProjects || !totals) {
      return null;
    }

    return seasonProjects
      .map(
        (project, i): PastSeasonProject => ({
          ...project,
          totalStreamed:
            totals[i]?.status === "success"
              ? (totals[i].result as bigint)
              : BigInt(0),
        }),
      )
      .sort((a, b) =>
        a.totalStreamed === b.totalStreamed
          ? 0
          : a.totalStreamed > b.totalStreamed
            ? -1
            : 1,
      );
  }, [seasonProjects, totals]);

  return { projects, isError };
}
