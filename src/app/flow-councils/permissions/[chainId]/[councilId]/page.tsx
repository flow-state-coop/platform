import Permissions from "../../permissions";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  return <Permissions chainId={Number(chainId)} councilId={councilId} />;
}
