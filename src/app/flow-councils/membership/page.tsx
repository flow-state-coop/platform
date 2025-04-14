import type { SearchParams } from "@/types/searchParams";
import Membership from "./membership";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Membership
      chainId={Number(searchParams.chainId)}
      councilId={searchParams.councilId}
    />
  );
}
