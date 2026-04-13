import RoundMetadata from "../../round-metadata";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  return <RoundMetadata chainId={Number(chainId)} councilId={councilId} />;
}
