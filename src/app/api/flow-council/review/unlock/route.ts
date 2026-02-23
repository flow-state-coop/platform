import { getServerSession } from "next-auth/next";
import { createPublicClient, http, parseAbi, Address, isAddress } from "viem";
import { celo } from "viem/chains";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { errorResponse } from "../../../utils";
import { RECIPIENT_MANAGER_ROLE } from "@/app/flow-councils/lib/constants";
import { findRoundByCouncil } from "../../auth";

export const dynamic = "force-dynamic";

const UNLOCKABLE_STATUSES = ["ACCEPTED", "GRADUATED", "REMOVED"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId, applicationId, editsUnlocked } = body;

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

    if (!applicationId || typeof applicationId !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid application ID" }),
      );
    }

    if (typeof editsUnlocked !== "boolean") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid editsUnlocked value",
        }),
      );
    }

    const publicClient = createPublicClient({
      chain: celo,
      transport: http(network.rpcUrl),
    });

    const hasRole = await publicClient.readContract({
      address: councilId as Address,
      abi: parseAbi([
        "function hasRole(bytes32 role, address account) view returns (bool)",
      ]),
      functionName: "hasRole",
      args: [RECIPIENT_MANAGER_ROLE, session.address as Address],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const application = await db
      .selectFrom("applications")
      .select(["id", "status"])
      .where("id", "=", applicationId)
      .where("roundId", "=", round.id)
      .executeTakeFirst();

    if (!application) {
      return new Response(
        JSON.stringify({ success: false, error: "Application not found" }),
      );
    }

    if (!UNLOCKABLE_STATUSES.includes(application.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Application status does not support unlocking edits",
        }),
      );
    }

    await db
      .updateTable("applications")
      .set({ editsUnlocked, updatedAt: new Date() })
      .where("id", "=", applicationId)
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
