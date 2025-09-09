import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Recipient from "./recipient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const cookies = await nextCookies();

  const { chainId, id } = await searchParams;

  return (
    <Recipient
      chainId={Number(chainId)}
      flowCouncilId={id}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
