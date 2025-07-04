import Explore from "./explore";
import { base, optimism, arbitrum } from "viem/chains";
import { gql, request } from "graphql-request";
import { Inflow } from "@/types/inflow";
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
  ["guild-guild"]: {
    safeAddress: "0x29f4c46e04b9d35724af08f314d936f44f52527c",
    token: "0xe6c8d111337d0052b9d88bf5d7d55b7f8385acd3",
  },
  ["chonesguild"]: {
    safeAddress: "0xc40f7733f0ea30bb6f797c88444769e00775d021",
    token: "0xe6c8d111337d0052b9d88bf5d7d55b7f8385acd3",
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
  const guildGuildQueryRes = await request<{ account: Account }>(
    networks.find((network) => network.id === arbitrum.id)!.superfluidSubgraph,
    FLOW_GUILD_QUERY,
    {
      safeAddress: FLOW_GUILD_ADDRESSES["guild-guild"].safeAddress,
      token: FLOW_GUILD_ADDRESSES["guild-guild"].token,
    },
  );
  const chonesGuildQueryRes = await request<{ account: Account }>(
    networks.find((network) => network.id === arbitrum.id)!.superfluidSubgraph,
    FLOW_GUILD_QUERY,
    {
      safeAddress: FLOW_GUILD_ADDRESSES["chonesguild"].safeAddress,
      token: FLOW_GUILD_ADDRESSES["chonesguild"].token,
    },
  );

  return (
    <Explore
      coreInflow={coreQueryRes.account.accountTokenSnapshots[0]}
      greenpillInflow={greenpillQueryRes.account.accountTokenSnapshots[0]}
      guildGuildInflow={guildGuildQueryRes.account.accountTokenSnapshots[0]}
      chonesGuildInflow={chonesGuildQueryRes.account.accountTokenSnapshots[0]}
    />
  );
}
