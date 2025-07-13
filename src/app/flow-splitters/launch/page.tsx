import type { SearchParams } from "@/types/searchParams";
import { networks } from "@/lib/networks";
import Launch from "./launch";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const network =
    networks.find((network) => network.id === Number(searchParams.chainId)) ??
    networks[1];

  return <Launch defaultNetwork={network} />;
}
