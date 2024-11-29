import dynamic from "next/dynamic";
import type { SearchParams } from "@/types/searchParams";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

const Core = dynamic(() => import("./core"), {
  ssr: false,
});

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
