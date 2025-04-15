import { cookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Grantee from "./grantee";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Grantee
      chainId={Number(searchParams.chainId)}
      councilId={searchParams.councilId}
      csfrToken={
        cookies().get("next-auth.csrf-token")?.value.split("|")[0] ?? ""
      }
    />
  );
}
