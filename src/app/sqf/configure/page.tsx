import type { SearchParams } from "@/types/searchParams";
import Configure from "./configure";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Configure
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
      profileId={searchParams.profileId ?? null}
      poolId={searchParams.poolId ?? null}
      showNextButton={searchParams.showNextButton ? true : false}
    />
  );
}
