import Application from "./application";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string; projectId: string }>;
}) {
  const { chainId, councilId, projectId } = await params;

  return (
    <Application
      chainId={Number(chainId)}
      councilId={councilId}
      projectId={projectId === "new" ? undefined : projectId}
    />
  );
}
