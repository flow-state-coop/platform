import { SearchParams } from "@/types/searchParams";
import FlowSplitters from "./flow-splitters";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const defaultNetwork =
    networks.find((network) => network.id === Number(searchParams.chainId)) ??
    networks[1];

  return <FlowSplitters defaultNetwork={defaultNetwork} />;
}
