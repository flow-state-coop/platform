import type { SearchParams } from "@/types/searchParams";
import Membership from "./membership";
import { councilConfig } from "../lib/councilConfig";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const chainId = searchParams.chainId ? Number(searchParams.chainId) : 42220;
  const councilId = councilConfig[chainId]?.councilAddress;

  return <Membership chainId={chainId} councilId={councilId} />;
}
