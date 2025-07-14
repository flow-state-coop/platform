import type { SearchParams } from "@/types/searchParams";
import { flowGuildConfigs } from "../lib/flowGuildConfig";
import FlowGuild from "./flow-guild";

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Promise<SearchParams>;
}) {
  const flowGuildConfig = flowGuildConfigs[params.id];

  if (!flowGuildConfig) {
    return <div className="m-auto fs-1 fw-bold">Flow Guild Not Found</div>;
  }

  const { chainId } = await searchParams;

  return (
    <FlowGuild
      flowGuildConfig={flowGuildConfig}
      chainId={chainId ? Number(chainId) : flowGuildConfig.defaultChainId}
    />
  );
}
