import { headers, cookies as nextCookies } from "next/headers";
import Communications from "./communications";

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
    <Communications
      chainId={Number(chainId)}
      councilId={councilId}
      hostname={hostname ?? ""}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
