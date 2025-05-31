import { getServerSession } from "next-auth/next";
import {
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  parseAbi,
  Address,
  Chain,
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
    const { grantees, chainId, councilId } = await request.json();

    const session = await getServerSession(authOptions);
    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });

    const granteeManagerRole = keccak256(
      encodePacked(["string"], ["GRANTEE_MANAGER_ROLE"]),
    );

    const hasRole = await publicClient.readContract({
      address: councilId as Address,
      abi: parseAbi([
        "function hasRole(bytes32 role, address account) view returns (bool)",
      ]),
      functionName: "hasRole",
      args: [granteeManagerRole, session?.address as Address],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    for (const grantee of grantees) {
      await db
        .updateTable("applications")
        .set({
          status: grantee.status,
        })
        .where("owner", "=", grantee.owner.toLowerCase())
        .where("chainId", "=", chainId)
        .where("councilId", "=", councilId.toLowerCase())
        .execute();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Success! Application pending`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
