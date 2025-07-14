import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Grantee from "./grantee";
import { councilConfig } from "../lib/councilConfig";
import { DEFAULT_CHAIN_ID } from "../lib/constants";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;

  const councilId = councilConfig[chainId ?? DEFAULT_CHAIN_ID]?.councilAddress;
  const cookies = await nextCookies();

  return (
    <Grantee
      chainId={chainId ? Number(chainId) : DEFAULT_CHAIN_ID}
      councilId={councilId}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
