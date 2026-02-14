import { cookies as nextCookies } from "next/headers";
import FlowCouncil from "./flow-council";

type Params = {
  chainId: string;
  councilId: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  const cookies = await nextCookies();
  const { chainId, councilId } = await params;

  return (
    <FlowCouncil
      chainId={Number(chainId)}
      councilId={councilId}
      csfrToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
