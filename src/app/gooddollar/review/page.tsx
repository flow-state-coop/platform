import type { SearchParams } from "@/types/searchParams";
import Review from "./review";
import { headers, cookies } from "next/headers";
import { councilConfig } from "../lib/councilConfig";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const headersList = await headers();
  const hostname = headersList.get("host");
  const chainId = searchParams.chainId ? Number(searchParams.chainId) : 42220;
  const councilId = councilConfig[chainId]?.councilAddress;

  return (
    <Review
      chainId={chainId}
      councilId={councilId}
      hostname={hostname ?? ""}
      csfrToken={
        cookies().get("next-auth.csrf-token")?.value.split("|")[0] ?? ""
      }
    />
  );
}
