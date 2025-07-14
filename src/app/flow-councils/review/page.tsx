import type { SearchParams } from "@/types/searchParams";
import Review from "./review";
import { headers, cookies as nextCookies } from "next/headers";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const headersList = await headers();
  const hostname = headersList.get("host");
  const cookies = await nextCookies();

  const { chainId, councilId } = await searchParams;

  return (
    <Review
      chainId={Number(chainId)}
      councilId={councilId}
      hostname={hostname ?? ""}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
