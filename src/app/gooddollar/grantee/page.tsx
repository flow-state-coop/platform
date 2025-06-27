import { cookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Grantee from "./grantee";
import { councilConfig } from "../lib/councilConfig";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const chainId = searchParams.chainId ? Number(searchParams.chainId) : 42220;
  const councilId = councilConfig[chainId]?.councilAddress;

  return (
    <Grantee
      chainId={chainId}
      councilId={councilId}
      csfrToken={
        cookies().get("next-auth.csrf-token")?.value.split("|")[0] ?? ""
      }
    />
  );
}
