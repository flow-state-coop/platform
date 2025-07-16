import Explore from "./explore";
import { base, celo, optimism } from "viem/chains";
import { gql, request } from "graphql-request";
import { Inflow } from "@/types/inflow";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";

const FLOW_GUILD_QUERY = gql`
  query FlowGuildQuery($safeAddress: String, $token: String) {
    account(id: $safeAddress) {
      id
      accountTokenSnapshots(where: { token: $token }) {
        id
        totalAmountStreamedInUntilUpdatedAt
        totalInflowRate
        updatedAtTimestamp
      }
    }
  }
`;

const GDA_POOL_QUERY = gql`
  query GDAPoolQuery($gdaPool: String) {
    pool(id: $gdaPool) {
      id
      flowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
    }
  }
`;

type Account = {
  id: string;
  accountTokenSnapshots: Inflow[];
};

const FLOW_GUILD_ADDRESSES = {
  ["core"]: {
    safeAddress: "0x0d9d26375b882e0ddb38a781a40e80945e3d0b9b",
    token: "0x46fd5cfb4c12d87acd3a13e92baa53240c661d93",
  },
  ["greenpill"]: {
    safeAddress: "0x49fa954b6c2cd14b4b3604ef1cc17ced20a9e42c",
    token: "0x4ac8bd1bdae47beef2d1c6aa62229509b962aa0d",
  },
};

export default async function Page() {
  const coreQueryRes = await request<{ account: Account }>(
    networks.find((network) => network.id === base.id)!.superfluidSubgraph,
    FLOW_GUILD_QUERY,
    {
      safeAddress: FLOW_GUILD_ADDRESSES["core"].safeAddress,
      token: FLOW_GUILD_ADDRESSES["core"].token,
    },
  );
  const greenpillQueryRes = await request<{ account: Account }>(
    networks.find((network) => network.id === optimism.id)!.superfluidSubgraph,
    FLOW_GUILD_QUERY,
    {
      safeAddress: FLOW_GUILD_ADDRESSES["greenpill"].safeAddress,
      token: FLOW_GUILD_ADDRESSES["greenpill"].token,
    },
  );
  const goodDollarQueryRes = await request<{ pool: GDAPool }>(
    networks.find((network) => network.id === celo.id)!.superfluidSubgraph,
    GDA_POOL_QUERY,
    {
      gdaPool: "0xafcab1ab378354b8ce0dbd0ae2e2c0dea01dcf0b",
    },
  );

  return (
    <Explore
      coreInflow={coreQueryRes.account.accountTokenSnapshots[0]}
      greenpillInflow={greenpillQueryRes.account.accountTokenSnapshots[0]}
      goodDollarPool={goodDollarQueryRes.pool}
    />
  );
}
