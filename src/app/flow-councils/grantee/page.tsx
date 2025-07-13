import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Grantee from "./grantee";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookies = await nextCookies();

  return (
    <Grantee
      chainId={Number(searchParams.chainId)}
      councilId={searchParams.councilId}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
