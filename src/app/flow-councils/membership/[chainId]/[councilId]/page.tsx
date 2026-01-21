import Membership from "../../membership";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  return <Membership chainId={Number(chainId)} councilId={councilId} />;
}
