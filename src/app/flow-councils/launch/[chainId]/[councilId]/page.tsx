import Launch from "../../launch";
import { networks } from "@/lib/networks";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];

  return <Launch defaultNetwork={network} councilId={councilId} />;
}
