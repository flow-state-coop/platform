import type { SearchParams } from "@/types/searchParams";
import Review from "./review";
import { headers, cookies } from "next/headers";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const headersList = await headers();
  const hostname = headersList.get("host");

  return (
    <Review
      chainId={Number(searchParams.chainId)}
      councilId={searchParams.councilId}
      hostname={hostname ?? ""}
      csfrToken={
        cookies().get("next-auth.csrf-token")?.value.split("|")[0] ?? ""
      }
    />
  );
}
