import { SearchParams } from "@/types/searchParams";
import Pools from "./pools";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, pool } = await searchParams;

  const defaultNetwork =
    networks.find((network) => network.id === Number(chainId)) ?? networks[1];

  return <Pools defaultNetwork={defaultNetwork} defaultPoolAddress={pool} />;
}
