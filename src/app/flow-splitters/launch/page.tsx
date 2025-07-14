import type { SearchParams } from "@/types/searchParams";
import { networks } from "@/lib/networks";
import Launch from "./launch";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[1];

  return <Launch defaultNetwork={network} />;
}
