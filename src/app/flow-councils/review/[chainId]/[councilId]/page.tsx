import { headers, cookies as nextCookies } from "next/headers";
import Review from "../../review";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const headersList = await headers();
  const hostname = headersList.get("host");
  const cookies = await nextCookies();
  const { chainId, councilId } = await params;

  return (
    <Review
      chainId={Number(chainId)}
      councilId={councilId}
      hostname={hostname ?? ""}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
