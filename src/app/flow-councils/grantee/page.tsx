import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Grantee from "./grantee";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const cookies = await nextCookies();

  const { chainId, councilId } = await searchParams;

  return (
    <Grantee
      chainId={Number(chainId)}
      councilId={councilId}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
