import type { SearchParams } from "@/types/searchParams";
import Pools from "./pools";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Pools
      profileId={searchParams.profileId ?? null}
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
    />
  );
}
