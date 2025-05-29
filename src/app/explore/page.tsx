import Explore from "./explore";
import { base, optimism } from "viem/chains";
import { gql, request } from "graphql-request";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";

const FLOW_GUILD_QUERY = gql`
  query FlowGuildQuery($gdaPool: String) {
    pool(id: $gdaPool) {
      id
      flowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
    }
  }
`;

const FLOW_GUILD_ADDRESSES = {
  ["core"]: {
    gdaPool: "0x83b00619da1cd93f86884c156bf7fab046bda3f6",
  },
  ["greenpill"]: {
    gdaPool: "0xac3ff0495373556b09c6aeca71383566a4c5a005",
  },
};

export default async function Page() {
  const coreQueryRes = await request<{ pool: GDAPool }>(
    networks.find((network) => network.id === base.id)!.superfluidSubgraph,
    FLOW_GUILD_QUERY,
    {
      gdaPool: FLOW_GUILD_ADDRESSES["core"].gdaPool,
    },
  );
  const greenpillQueryRes = await request<{ pool: GDAPool }>(
    networks.find((network) => network.id === optimism.id)!.superfluidSubgraph,
    FLOW_GUILD_QUERY,
    {
      gdaPool: FLOW_GUILD_ADDRESSES["greenpill"].gdaPool,
    },
  );

  return (
    <Explore
      corePool={coreQueryRes.pool}
      greenpillPool={greenpillQueryRes.pool}
    />
  );
}
