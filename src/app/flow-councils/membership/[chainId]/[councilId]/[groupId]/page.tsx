import { notFound } from "next/navigation";
import GroupDetail from "../../../GroupDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string; groupId: string }>;
}) {
  const { chainId, councilId, groupId } = await params;

  // Group ids are positive integers. A non-numeric route param would otherwise
  // become NaN and silently match nothing in the DB query, rendering the
  // generic "Group not found" state instead of a proper 404.
  const parsedGroupId = Number(groupId);

  if (!Number.isInteger(parsedGroupId) || parsedGroupId <= 0) {
    notFound();
  }

  return (
    <GroupDetail
      chainId={Number(chainId)}
      councilId={councilId}
      groupId={parsedGroupId}
    />
  );
}
