import { SearchParams } from "@/types/searchParams";
import FlowCouncils from "./flow-councils";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const defaultNetwork =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];

  return <FlowCouncils defaultNetwork={defaultNetwork} />;
}
