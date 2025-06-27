import GoodDollar from "./good-dollar";
import { SearchParams } from "@/types/searchParams";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <GoodDollar
      chainId={searchParams.chainId ? Number(searchParams.chainId) : 42220}
    />
  );
}
