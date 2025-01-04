import dynamic from "next/dynamic";
import type { SearchParams } from "@/types/searchParams";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

const GithubRewards = dynamic(() => import("./github-rewards"), {
  ssr: false,
});

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <GithubRewards
      chainId={
        searchParams.chainId ? Number(searchParams.chainId) : DEFAULT_CHAIN_ID
      }
    />
  );
}
