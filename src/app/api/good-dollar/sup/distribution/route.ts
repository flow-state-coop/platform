import { NextRequest } from "next/server";
import { formatEther } from "viem";
import { gql, request } from "graphql-request";
import { StackClient } from "@stackso/js-core";
import { networks } from "@/lib/networks";
import { councilConfig } from "@/app/gooddollar/lib/councilConfig";
import { GDAPool } from "@/types/gdaPool";

export const dynamic = "force-dynamic";

const GDA_POOL_QUERY = gql`
  query GDAPoolQuery($gdaPool: String!) {
    pool(id: $gdaPool) {
      poolDistributors {
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

export async function GET(req: NextRequest) {
  try {
    const chainId = req.nextUrl.searchParams.get("chainId") ?? 42220;
    const network = networks.find((network) => network.id === Number(chainId));
    const config = councilConfig[chainId];

    if (!network || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const tokensPerDollar = network.id === 42220 ? 10000 : 1;
    const now = (Date.now() / 1000) | 0;
    const stack = new StackClient({
      apiKey: config.stackApiKey,
      pointSystemId: config.pointSystemId,
    });
    const queryRes = await request<{ pool: GDAPool }>(
      network.superfluidSubgraph,
      GDA_POOL_QUERY,
      {
        gdaPool: config.gdaPool,
      },
    );
    const distributors = queryRes?.pool?.poolDistributors;
    const events = [];

    if (distributors) {
      for (const distributor of distributors) {
        const currentPoints = Number(
          await stack.getPoints(distributor.account.id, {
            event: "distributed",
          }),
        );
        const totalDistributed =
          BigInt(distributor.totalAmountFlowedDistributedUntilUpdatedAt) +
          BigInt(distributor.flowRate) *
            BigInt(now - distributor.updatedAtTimestamp);
        const newPoints =
          (Number(formatEther(totalDistributed)) / tokensPerDollar) | 0;
        const diff = newPoints - currentPoints;

        if (diff > 0) {
          events.push({
            event: "distributed",
            payload: {
              points: diff,
              account: distributor.account.id,
              uniqueId: `${distributor.account.id}-${now}`,
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
          message: `Points updated`,
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Nothing to update`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
