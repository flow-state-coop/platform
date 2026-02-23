import { cookies as nextCookies } from "next/headers";
import Launch from "../../launch";
import { networks } from "@/lib/networks";

const defaultNetwork = networks.find((n) => n.label === "celo")!;

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const cookies = await nextCookies();
  const { chainId, councilId } = await params;

  const network =
    networks.find((network) => network.id === Number(chainId)) ??
    defaultNetwork;

  return (
    <Launch
      defaultNetwork={network}
      councilId={councilId}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
