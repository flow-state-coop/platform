import type { SearchParams } from "@/types/searchParams";
import Launch from "./launch";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const matchedNetwork = networks.find(
    (network) => network.id === Number(chainId),
  );
  const network =
    matchedNetwork ?? networks.find((network) => network.label === "celo")!;

  return (
    <Launch defaultNetwork={network} isChainIdExplicit={!!matchedNetwork} />
  );
}
