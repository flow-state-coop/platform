import Launch from "../../launch";
import { networks } from "@/lib/networks";

const defaultNetwork = networks.find((n) => n.label === "celo")!;

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  const network =
    networks.find((network) => network.id === Number(chainId)) ??
    defaultNetwork;

  return <Launch defaultNetwork={network} councilId={councilId} />;
}
