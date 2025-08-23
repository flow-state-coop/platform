import type { SearchParams } from "@/types/searchParams";
import Review from "./review";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, profileId, poolId } = await searchParams;

  return (
    <Review
      chainId={chainId ? Number(chainId) : null}
      profileId={profileId ?? null}
      poolId={poolId ?? null}
    />
  );
}
