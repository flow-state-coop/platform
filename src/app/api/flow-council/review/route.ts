import { getServerSession } from "next-auth/next";
import {
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  parseAbi,
  Address,
  Chain,
  isAddress,
} from "viem";
import { optimism, arbitrum, base, optimismSepolia } from "wagmi/chains";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

const chains: { [id: number]: Chain } = {
  10: optimism,
  42161: arbitrum,
  8453: base,
  11155420: optimismSepolia,
};

export async function POST(request: Request) {
  try {
    const { applications, chainId, councilId } = await request.json();

    const session = await getServerSession(authOptions);
    const network = networks.find((network) => network.id === chainId);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });

    const recipientManagerRole = keccak256(
      encodePacked(["string"], ["RECIPIENT_MANAGER_ROLE"]),
    );

    const hasRole = await publicClient.readContract({
      address: councilId as Address,
      abi: parseAbi([
        "function hasRole(bytes32 role, address account) view returns (bool)",
      ]),
      functionName: "hasRole",
      args: [recipientManagerRole, session.address as Address],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    for (const application of applications) {
      if (!application.id || typeof application.id !== "number") {
        continue;
      }

      await db
        .updateTable("applications")
        .set({
          status: application.status,
          updatedAt: new Date(),
        })
        .where("id", "=", application.id)
        .where("roundId", "=", round.id)
        .execute();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Applications updated successfully",
      }),
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
