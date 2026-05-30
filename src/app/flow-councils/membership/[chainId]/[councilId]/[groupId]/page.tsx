import GroupDetail from "../../../GroupDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string; groupId: string }>;
}) {
  const { chainId, councilId, groupId } = await params;

  return (
    <GroupDetail
      chainId={Number(chainId)}
      councilId={councilId}
      groupId={Number(groupId)}
    />
  );
}
