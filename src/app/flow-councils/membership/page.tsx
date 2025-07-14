import type { SearchParams } from "@/types/searchParams";
import Membership from "./membership";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, councilId } = await searchParams;

  return <Membership chainId={Number(chainId)} councilId={councilId} />;
}
