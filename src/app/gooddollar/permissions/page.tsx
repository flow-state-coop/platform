import type { SearchParams } from "@/types/searchParams";
import Permissions from "./permissions";
import { councilConfig } from "../lib/councilConfig";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const chainId = searchParams.chainId ? Number(searchParams.chainId) : 42220;
  const councilId = councilConfig[chainId]?.councilAddress;

  return <Permissions chainId={chainId} councilId={councilId} />;
}
