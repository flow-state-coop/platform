import Grantee from "./grantee";
import type { SearchParams } from "@/types/searchParams";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, poolId } = await searchParams;

  return (
    <Grantee
      chainId={chainId ? Number(chainId) : null}
      poolId={poolId ?? null}
    />
  );
}
