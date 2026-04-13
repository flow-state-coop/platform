import { headers } from "next/headers";
import Review from "../../review";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const headersList = await headers();
  const hostname = headersList.get("host");
  const { chainId, councilId } = await params;

  return (
    <Review
      chainId={Number(chainId)}
      councilId={councilId}
      hostname={hostname ?? ""}
    />
  );
}
