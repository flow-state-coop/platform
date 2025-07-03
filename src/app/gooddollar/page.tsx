import GoodDollar from "./good-dollar";
import { SearchParams } from "@/types/searchParams";
import { DEFAULT_CHAIN_ID } from "./lib/constants";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <GoodDollar
      chainId={
        searchParams.chainId ? Number(searchParams.chainId) : DEFAULT_CHAIN_ID
      }
    />
  );
}
