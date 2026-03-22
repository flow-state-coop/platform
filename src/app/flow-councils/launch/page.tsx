import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Launch from "./launch";
import { networks } from "@/lib/networks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { chainId } = await searchParams;
  const cookies = await nextCookies();

  const network =
    networks.find((network) => network.id === Number(chainId)) ??
    networks.find((network) => network.label === "celo")!;

  return (
    <Launch
      defaultNetwork={network}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
