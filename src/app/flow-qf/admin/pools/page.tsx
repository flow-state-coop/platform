import type { SearchParams } from "@/types/searchParams";
import Pools from "./pools";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profileId, chainId } = await searchParams;

  return (
    <Pools
      profileId={profileId ?? null}
      chainId={chainId ? Number(chainId) : null}
    />
  );
}
