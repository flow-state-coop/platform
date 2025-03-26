import type { SearchParams } from "@/types/searchParams";
import Matching from "./matching";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Matching
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
      profileId={searchParams.profileId ?? null}
      poolId={searchParams.poolId ?? null}
    />
  );
}
