import { gql, request as graphQlRequest } from "graphql-request";
import { StackClient } from "@stackso/js-core";
import { db } from "../../flow-council/db";
import { councilConfig } from "@/app/gooddollar/lib/councilConfig";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

const SECONDS_IN_WEEK = 604800;

const VOTE_QUERY = gql`
  query VoteQuery($councilId: String, $address: String) {
    allocations(
      where: { council: $councilId, councilMember_: { account: $address } }
      orderBy: allocatedAt
      orderDirection: desc
      first: 1
    ) {
      allocatedAt
    }
  }
`;

export async function POST(request: Request) {
  try {
    const { address, chainId, event } = await request.json();

    const network = networks.find((network) => network.id === chainId);
    const config = councilConfig[chainId];

    if (!network || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const now = (Date.now() / 1000) | 0;

    const stack = new StackClient({
      apiKey:
        network.id === 42220
          ? process.env.STACK_API_KEY_CELO!
          : process.env.STACK_API_KEY_OP_SEPOLIA!,
      pointSystemId: config.pointSystemId,
    });

    const latestEpoch = (
      await db
        .selectFrom("supEpochs")
        .select("id")
        .select("startTimestamp")
        .select("endTimestamp")
        .where("chainId", "=", chainId)
        .orderBy("endTimestamp", "desc")
        .limit(1)
        .execute()
    )[0];

    let currentEpoch;

    if (now > latestEpoch.endTimestamp) {
      currentEpoch = {
        id: latestEpoch.id + 1,
        chainId,
        startTimestamp: latestEpoch.endTimestamp,
        endTimestamp: latestEpoch.endTimestamp + SECONDS_IN_WEEK * 2,
      };

      db.insertInto("supEpochs").values(currentEpoch).execute();
    } else {
      currentEpoch = latestEpoch;
    }

    const votesQueryRes = await graphQlRequest<{
      allocations: { allocatedAt: string }[];
    }>(network.flowCouncilSubgraph, VOTE_QUERY, {
      councilId: config.councilAddress,
      address: address.toLowerCase(),
    });
    const allocation = votesQueryRes?.allocations[0];

    if (
      !allocation ||
      Number(allocation.allocatedAt) < currentEpoch.startTimestamp
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Address has not allocated during epoch",
        }),
      );
    }

    const addressByEpoch = (
      await db
        .selectFrom("supAddresses")
        .select("address")
        .select("epoch")
        .where("address", "=", address.toLowerCase())
        .where("epoch", "=", currentEpoch.id)
        .where("chainId", "=", chainId)
        .where("eventEmitted", "=", event)
        .execute()
    )[0];

    if (addressByEpoch) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Points already assigned to address during epoch",
        }),
      );
    }

    await stack.track(event, {
      account: address.toLowerCase(),
      points: 10,
      uniqueId: `${address.toLowerCase()}-${allocation.allocatedAt}`,
    });

    db.insertInto("supAddresses")
      .values({
        address: address.toLowerCase(),
        chainId,
        epoch: currentEpoch.id,
        eventEmitted: event,
      })
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Success! Points assigned",
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
