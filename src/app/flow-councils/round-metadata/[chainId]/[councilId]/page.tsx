import { cookies as nextCookies } from "next/headers";
import RoundMetadata from "../../round-metadata";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const cookies = await nextCookies();
  const { chainId, councilId } = await params;

  return (
    <RoundMetadata
      chainId={Number(chainId)}
      councilId={councilId}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
