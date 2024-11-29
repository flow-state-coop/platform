import type { SearchParams } from "@/types/searchParams";
import Projects from "./projects";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Projects
      chainId={
        searchParams.chainId ? Number(searchParams.chainId) : DEFAULT_CHAIN_ID
      }
      owner={searchParams.owner ?? null}
    />
  );
}
