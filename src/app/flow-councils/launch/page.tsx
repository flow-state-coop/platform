import type { SearchParams } from "@/types/searchParams";
import Launch from "./launch";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, councilId } = await searchParams;

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];

  return <Launch defaultNetwork={network} councilId={councilId} />;
}
