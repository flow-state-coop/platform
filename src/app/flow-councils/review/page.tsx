import type { SearchParams } from "@/types/searchParams";
import Review from "./review";
import { cookies } from "next/headers";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Review
      chainId={Number(searchParams.chainId)}
      councilId={searchParams.councilId}
      csfrToken={
        cookies().get("next-auth.csrf-token")?.value.split("|")[0] ?? ""
      }
    />
  );
}
