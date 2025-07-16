import type { SearchParams } from "@/types/searchParams";
import Configure from "./configure";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, profileId, poolId, showNextButton } = await searchParams;

  return (
    <Configure
      chainId={chainId ? Number(chainId) : null}
      profileId={profileId ?? null}
      poolId={poolId ?? null}
      showNextButton={showNextButton ? true : false}
    />
  );
}
