import Grantee from "./grantee";
import type { SearchParams } from "@/types/searchParams";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Grantee
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
      poolId={searchParams.poolId ?? null}
    />
  );
}
