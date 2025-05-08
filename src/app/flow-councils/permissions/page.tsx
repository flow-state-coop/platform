import type { SearchParams } from "@/types/searchParams";
import Permissions from "./permissions";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Permissions
      chainId={Number(searchParams.chainId)}
      councilId={searchParams.councilId}
    />
  );
}
