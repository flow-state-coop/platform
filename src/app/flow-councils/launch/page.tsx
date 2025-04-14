import type { SearchParams } from "@/types/searchParams";
import Launch from "./launch";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const network =
    networks.find((network) => network.id === Number(searchParams.chainId)) ??
    networks[0];

  return <Launch defaultNetwork={network} councilId={searchParams.councilId} />;
}
