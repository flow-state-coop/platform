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

const PROGRAM_ID = 7743;
const POOLS = [
  "0x9ef9fe8bf503b10698322e3a135c0fa6decc5b5b",
  "0x6719cbb70d0faa041f1056542af66066e3cc7a24",
];

const getDistributors = async (subgraphEndpoint: string, timestamp: number) => {
  const distributors: { address: string; totalDistributed: bigint }[] = [];

  for (const poolId of POOLS) {
    const queryRes = await request<{ pool: GDAPool }>(
      subgraphEndpoint,
      GDA_POOL_QUERY,
      {
        gdaPool: poolId,
      },
    );

    for (const distributor of queryRes.pool.poolDistributors) {
      const existingDistributor = distributors.find(
        (x) => x.address === distributor.account.id,
      );
      const totalDistributed =
        BigInt(distributor.totalAmountFlowedDistributedUntilUpdatedAt) +
        BigInt(distributor.flowRate) *
          BigInt(timestamp - distributor.updatedAtTimestamp);

      if (existingDistributor) {
        existingDistributor.totalDistributed += totalDistributed;
      } else {
        distributors.push({
          address: distributor.account.id,
          totalDistributed,
        });
      }
    }
  }

  return distributors;
};

export async function GET(req: NextRequest) {
  try {
    const chainId = req.nextUrl.searchParams.get("chainId") ?? 8453;
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
        network.id === 8453
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
              points: diff,
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
