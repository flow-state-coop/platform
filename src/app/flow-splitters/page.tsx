import { SearchParams } from "@/types/searchParams";
import FlowSplitters from "./flow-splitters";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const defaultNetwork =
    networks.find((network) => network.id === Number(chainId)) ??
    networks.find((network) => network.label === "base")!;

  return <FlowSplitters defaultNetwork={defaultNetwork} />;
}
