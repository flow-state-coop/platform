import type { SearchParams } from "@/types/searchParams";
import Membership from "./membership";
import { councilConfig } from "../lib/councilConfig";
import { DEFAULT_CHAIN_ID } from "../lib/constants";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const councilId = councilConfig[chainId ?? DEFAULT_CHAIN_ID]?.councilAddress;

  return (
    <Membership
      chainId={chainId ? Number(chainId) : DEFAULT_CHAIN_ID}
      councilId={councilId}
    />
  );
}
