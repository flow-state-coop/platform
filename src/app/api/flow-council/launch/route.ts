import { getServerSession } from "next-auth/next";
import { createPublicClient, http, parseAbi, Address, isAddress } from "viem";
import { celo } from "viem/chains";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { DEFAULT_ADMIN_ROLE } from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { chainId, flowCouncilAddress, name, description, logoUrl } =
      await request.json();

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network || network.label !== "celo") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid network" }),
      );
    }

    if (!isAddress(flowCouncilAddress)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid flow council address",
        }),
      );
    }

    if (!name || !description) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing name or description",
        }),
      );
    }

    const publicClient = createPublicClient({
      chain: celo,
      transport: http(network.rpcUrl),
    });

    const hasRole = await publicClient.readContract({
      address: flowCouncilAddress as Address,
      abi: parseAbi([
        "function hasRole(bytes32 role, address account) view returns (bool)",
      ]),
      functionName: "hasRole",
      args: [DEFAULT_ADMIN_ROLE, session.address as Address],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Not an admin of this council",
        }),
      );
    }

    const round = await db.transaction().execute(async (trx) => {
      const insertedRound = await trx
        .insertInto("rounds")
        .values({
          chainId,
          flowCouncilAddress: flowCouncilAddress.toLowerCase(),
          details: JSON.stringify({ name, description, logoUrl }),
        })
        .returning(["id", "chainId", "flowCouncilAddress", "details"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("roundAdmins")
        .values({
          roundId: insertedRound.id,
          adminAddress: session.address.toLowerCase(),
        })
        .execute();

      return insertedRound;
    });

    return new Response(JSON.stringify({ success: true, round }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Failed to create round",
      }),
    );
  }
}
