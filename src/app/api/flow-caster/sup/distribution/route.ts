import { NextRequest } from "next/server";
import { getAddress, formatEther } from "viem";
import { gql, request } from "graphql-request";
import { StackClient } from "@stackso/js-core";
import { networks } from "@/lib/networks";
import { GDAPool } from "@/types/gdaPool";

export const dynamic = "force-dynamic";

const GDA_POOL_QUERY = gql`
  query GDAPoolQuery($gdaPool: String!) {
    pool(id: $gdaPool) {
      poolDistributors(first: 1000) {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
    }
  }
`;

const PROGRAM_ID = 7761;
const POOLS = [
  "0x1e7d8cd08844fc374f6e049146cae8f640971120",
  "0xed480a635c5dffe1640a895bc39d8491a79c9aa9",
];

const getDistributors = async (subgraphEndpoint: string, timestamp: number) => {
  const distributors: {
    address: string;
    totalDistributed: bigint;
    hasStreamToTeamPool: boolean;
  }[] = [];

  for (const poolId of POOLS) {
    const queryRes = await request<{ pool: GDAPool }>(
      subgraphEndpoint,
      GDA_POOL_QUERY,
      {
        gdaPool: poolId,
      },
    );

    if (!queryRes.pool?.poolDistributors) {
      continue;
    }

    for (const distributor of queryRes.pool.poolDistributors) {
      const existingDistributor = distributors.find(
        (x) => x.address === distributor.account.id,
      );
      const totalDistributed =
        BigInt(distributor.totalAmountFlowedDistributedUntilUpdatedAt) +
        BigInt(distributor.flowRate) *
          BigInt(timestamp - distributor.updatedAtTimestamp);

      const hasStreamToTeamPool =
        poolId === POOLS[1] && distributor.flowRate !== "0";

      if (existingDistributor) {
        existingDistributor.totalDistributed += totalDistributed;
        existingDistributor.hasStreamToTeamPool = hasStreamToTeamPool;
      } else {
        distributors.push({
          address: distributor.account.id,
          totalDistributed,
          hasStreamToTeamPool,
        });
      }
    }
  }

  return distributors;
};

export async function GET(req: NextRequest) {
  try {
    const chainId = req.nextUrl.searchParams.get("chainId") ?? 42161;
    const network = networks.find((network) => network.id === Number(chainId));

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const tokensPerDollar = 1;
    const now = (Date.now() / 1000) | 0;
    const stack = new StackClient({
      apiKey:
        network.id === 42161
          ? process.env.STACK_API_KEY_FLOW_CASTER!
          : process.env.STACK_API_KEY_OP_SEPOLIA!,
      pointSystemId: PROGRAM_ID,
    });
    const distributors = await getDistributors(network.superfluidSubgraph, now);
    const events = [];

    if (distributors) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentPointsAll: any = await stack.getPoints(
        distributors.map((x) => getAddress(x.address)),
        {
          event: "distributed",
        },
      );

      for (const distributor of distributors) {
        const currentPoints =
          currentPointsAll?.find(
            (x: { address: string }) =>
              x.address.toLowerCase() === distributor.address,
          )?.amount ?? 0;
        const totalDistributed = distributor.totalDistributed;
        const newPoints =
          (Number(formatEther(totalDistributed)) / tokensPerDollar) | 0;
        const diff = newPoints - currentPoints;

        if (diff > 0) {
          events.push({
            event: "distributed",
            payload: {
              points: distributor.hasStreamToTeamPool ? diff * 2 : diff,
              account: distributor.address,
              uniqueId: `${distributor.address}-${now}`,
            },
          });
        }
      }
    }

    if (events.length > 0) {
      await stack.trackMany(events);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Points updated",
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Nothing to update",
      }),
    );
  } catch (err) {
    console.error(err);

    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
