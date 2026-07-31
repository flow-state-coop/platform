import { db } from "./db";

export async function fetchDisplayNames(
  authorAddresses: string[],
): Promise<Record<string, string>> {
  const displayNames: Record<string, string> = {};
  const uniqueAddresses = [
    ...new Set(authorAddresses.map((a) => a.toLowerCase())),
  ];

  if (uniqueAddresses.length === 0) return displayNames;

  const profiles = await db
    .selectFrom("userProfiles")
    .select(["address", "displayName"])
    .where("address", "in", uniqueAddresses)
    .execute();

  for (const p of profiles) {
    displayNames[p.address] = p.displayName;
  }

  return displayNames;
}
