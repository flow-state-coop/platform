import type { SearchParams } from "@/types/searchParams";
import Voters from "./voters";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, id } = await searchParams;

  return <Voters chainId={Number(chainId)} flowCouncilId={id} />;
}
