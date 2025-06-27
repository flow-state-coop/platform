import type { SearchParams } from "@/types/searchParams";
import Admin from "./admin";
import { networks } from "@/lib/networks";
import { councilConfig } from "../lib/councilConfig";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const network =
    networks.find((network) => network.id === Number(searchParams.chainId)) ??
    networks[0];
  const councilId = councilConfig[network.id]?.councilAddress;

  return <Admin defaultNetwork={network} councilId={councilId} />;
}
