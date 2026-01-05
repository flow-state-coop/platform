import type { SearchParams } from "@/types/searchParams";
import RoundMetadata from "./round-metadata";
import { cookies as nextCookies } from "next/headers";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const cookies = await nextCookies();
  const { chainId, councilId } = await searchParams;

  return (
    <RoundMetadata
      chainId={Number(chainId)}
      councilId={councilId}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
