import type { SearchParams } from "@/types/searchParams";
import Matching from "./matching";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, profileId, poolId } = await searchParams;

  return (
    <Matching
      chainId={chainId ? Number(chainId) : null}
      profileId={profileId ?? null}
      poolId={poolId ?? null}
    />
  );
}
