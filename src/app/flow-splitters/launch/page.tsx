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
    networks.find((network) => network.id === Number(chainId)) ??
    networks.find((network) => network.label === "base")!;

  return <Launch defaultNetwork={network} />;
}
