import { db } from "./db";
import { type AuthorAffiliation, hasOnChainRole } from "./auth";
import { parseDetails } from "./utils";
import type { ProjectDetails } from "@/types/project";

export async function getAuthorAffiliations(
  addresses: string[],
  roundId: number,
  chainId: number,
  councilId: string,
): Promise<Record<string, AuthorAffiliation>> {
  if (addresses.length === 0) {
    return {};
  }

  const uniqueAddresses = [...new Set(addresses.map((a) => a.toLowerCase()))];

  const dbAdmins = await db
    .selectFrom("roundAdmins")
    .select("adminAddress")
    .where("roundId", "=", roundId)
    .where("adminAddress", "in", uniqueAddresses)
    .execute();

  const dbAdminSet = new Set(dbAdmins.map((a) => a.adminAddress.toLowerCase()));

  const projectManagersData = await db
    .selectFrom("projectManagers")
    .innerJoin(
      "applications",
      "projectManagers.projectId",
      "applications.projectId",
    )
    .innerJoin("projects", "projectManagers.projectId", "projects.id")
    .select(["projectManagers.managerAddress", "projects.details"])
    .where("applications.roundId", "=", roundId)
    .where("projectManagers.managerAddress", "in", uniqueAddresses)
    .execute();

  const projectManagerMap = new Map<string, string>();
  for (const pm of projectManagersData) {
    const addr = pm.managerAddress.toLowerCase();
    if (!projectManagerMap.has(addr)) {
      const projectName = parseDetails<ProjectDetails>(pm.details)?.name;
      if (projectName) {
        projectManagerMap.set(addr, projectName);
      }
    }
  }

  const addressesNeedingOnChainCheck = uniqueAddresses.filter(
    (addr) => !dbAdminSet.has(addr),
  );

  const onChainAdminSet = new Set<string>();
  if (addressesNeedingOnChainCheck.length > 0) {
    const onChainResults = await Promise.all(
      addressesNeedingOnChainCheck.map(async (addr) => {
        const hasRole = await hasOnChainRole(chainId, councilId, addr);
        return { addr, hasRole };
      }),
    );

    for (const { addr, hasRole } of onChainResults) {
      if (hasRole) {
        onChainAdminSet.add(addr);
      }
    }
  }

  const result: Record<string, AuthorAffiliation> = {};
  for (const addr of uniqueAddresses) {
    const isAdmin = dbAdminSet.has(addr) || onChainAdminSet.has(addr);
    const projectName = projectManagerMap.get(addr) || null;

    if (isAdmin || projectName) {
      result[addr] = { isAdmin, projectName };
    }
  }

  return result;
}
