import type { SearchParams } from "@/types/searchParams";
import dynamic from "next/dynamic";
import { networks } from "@/lib/networks";

const Launch = dynamic(() => import("./launch"), {
  ssr: false,
});

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const network =
    networks.find((network) => network.id === Number(searchParams.chainId)) ??
    networks[1];

  return <Launch defaultNetwork={network} />;
}
