import Tools from "./tools";
import type { SearchParams } from "@/types/searchParams";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Tools
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
      poolId={searchParams.poolId ?? null}
      recipientId={searchParams.recipientId ?? null}
    />
  );
}
