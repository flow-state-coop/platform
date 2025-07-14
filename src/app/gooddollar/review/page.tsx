import type { SearchParams } from "@/types/searchParams";
import Review from "./review";
import { headers, cookies as nextCookies } from "next/headers";
import { councilConfig } from "../lib/councilConfig";
import { DEFAULT_CHAIN_ID } from "../lib/constants";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const headersList = await headers();
  const hostname = headersList.get("host");
  const councilId = councilConfig[chainId ?? DEFAULT_CHAIN_ID]?.councilAddress;
  const cookies = await nextCookies();

  return (
    <Review
      chainId={chainId ? Number(chainId) : DEFAULT_CHAIN_ID}
      councilId={councilId}
      hostname={hostname ?? ""}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
