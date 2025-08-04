import { NextRequest } from "next/server";
import { getAddress, formatEther } from "viem";
import { gql, request } from "graphql-request";
import { StackClient } from "@stackso/js-core";
import { networks } from "@/lib/networks";
import { councilConfig } from "@/app/gooddollar/lib/councilConfig";
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
      apiKey:
        network.id === 42220
          ? process.env.STACK_API_KEY_GOOD_DOLLAR!
          : process.env.STACK_API_KEY_OP_SEPOLIA!,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentPointsAll: any = await stack.getPoints(
        distributors.map((x) => getAddress(x.account.id)),
        {
          event: "distributed",
        },
      );

      for (const distributor of distributors) {
        if (
          distributor.account.id ===
          "0x4e31993d9f13f940828bf9ec2f643a7e55b21e8c"
        ) {
          continue;
        }

        const currentPoints =
          currentPointsAll?.find(
            (x: { address: string }) =>
              x.address.toLowerCase() === distributor.account.id,
          )?.amount ?? 0;
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
