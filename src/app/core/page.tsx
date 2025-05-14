import type { SearchParams } from "@/types/searchParams";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";
import Core from "./core";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Core
      chainId={
        searchParams.chainId ? Number(searchParams.chainId) : DEFAULT_CHAIN_ID
      }
    />
  );
}
