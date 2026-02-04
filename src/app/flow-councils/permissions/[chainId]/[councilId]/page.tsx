import { cookies as nextCookies } from "next/headers";
import Permissions from "../../permissions";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const cookies = await nextCookies();
  const { chainId, councilId } = await params;

  return (
    <Permissions
      chainId={Number(chainId)}
      councilId={councilId}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
