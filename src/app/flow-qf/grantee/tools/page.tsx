import Tools from "./tools";
import type { SearchParams } from "@/types/searchParams";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, poolId, recipientId } = await searchParams;

  return (
    <Tools
      chainId={chainId ? Number(chainId) : null}
      poolId={poolId ?? null}
      recipientId={recipientId ?? null}
    />
  );
}
