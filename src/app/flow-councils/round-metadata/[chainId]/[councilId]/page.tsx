import { cookies as nextCookies } from "next/headers";
import RoundMetadata from "../../round-metadata";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
  searchParams: Promise<{ splitter?: string }>;
}) {
  const cookies = await nextCookies();
  const { chainId, councilId } = await params;
  const { splitter } = await searchParams;

  return (
    <RoundMetadata
      chainId={Number(chainId)}
      councilId={councilId}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
      splitterAddress={splitter ?? null}
    />
  );
}
