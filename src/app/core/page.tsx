import type { SearchParams } from "@/types/searchParams";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";
import Core from "./core";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Core chainId={DEFAULT_CHAIN_ID} edit={searchParams?.edit ? true : false} />
  );
}
