import type { SearchParams } from "@/types/searchParams";
import Permissions from "./permissions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId, councilId } = await searchParams;

  return <Permissions chainId={Number(chainId)} councilId={councilId} />;
}
