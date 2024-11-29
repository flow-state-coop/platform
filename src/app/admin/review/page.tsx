import type { SearchParams } from "@/types/searchParams";
import Review from "./review";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Review
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
      profileId={searchParams.profileId ?? null}
      poolId={searchParams.poolId ?? null}
    />
  );
}
