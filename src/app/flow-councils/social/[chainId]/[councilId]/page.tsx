import Social from "../../social";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  return <Social chainId={Number(chainId)} councilId={councilId} />;
}
