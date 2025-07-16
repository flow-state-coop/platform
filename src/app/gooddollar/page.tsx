import GoodDollar from "./good-dollar";
import { SearchParams } from "@/types/searchParams";
import { DEFAULT_CHAIN_ID } from "./lib/constants";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  return <GoodDollar chainId={chainId ? Number(chainId) : DEFAULT_CHAIN_ID} />;
}
