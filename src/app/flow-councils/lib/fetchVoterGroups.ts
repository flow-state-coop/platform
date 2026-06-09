import type { VoterGroup } from "../membership/voterTableTypes";

// Shared loader for a council's voter groups, used by both the membership
// overview (membership.tsx) and the per-group detail page (GroupDetail.tsx).
// Returns null on any failure (network, !res.ok, or success: false) so callers
// leave their current groups untouched rather than clobbering them with [].
export async function fetchVoterGroups(
  chainId: number | string,
  councilId: string,
): Promise<VoterGroup[] | null> {
  try {
    const res = await fetch(
      `/api/flow-council/voter-groups?chainId=${chainId}&councilId=${councilId}`,
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();

    return data.success ? (data.groups as VoterGroup[]) : null;
  } catch (err) {
    console.error(err);
    return null;
  }
}
