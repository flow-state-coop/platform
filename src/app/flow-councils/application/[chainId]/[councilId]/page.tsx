import ProjectSelection from "./project-selection";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  return <ProjectSelection chainId={Number(chainId)} councilId={councilId} />;
}
