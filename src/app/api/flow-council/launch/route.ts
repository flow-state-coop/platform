import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { createPublicClient, http, parseAbi, Address, isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks, getViemChain } from "@/lib/networks";
import { DEFAULT_ADMIN_ROLE } from "@/app/flow-councils/lib/constants";

// Type-validate the body so `listed` is handled the same way as the rounds
// PATCH route (z.boolean().optional()). Address/network/name are still checked
// below with their existing business-rule error messages, so this schema only
// enforces shapes and stays permissive on the optional metadata fields.
const launchSchema = z.object({
  chainId: z.number(),
  flowCouncilAddress: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  listed: z.boolean().optional(),
  superappSplitterAddress: z.string().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = launchSchema.safeParse(await request.json());

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const {
      chainId,
      flowCouncilAddress,
      name,
      description,
      logoUrl,
      listed,
      superappSplitterAddress,
    } = parsed.data;

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
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

    if (!name && !superappSplitterAddress) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing name or description",
        }),
      );
    }

    const publicClient = createPublicClient({
      chain: getViemChain(network.id),
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

    const validatedSplitterAddress =
      superappSplitterAddress && isAddress(superappSplitterAddress)
        ? superappSplitterAddress.toLowerCase()
        : null;

    const round = await db.transaction().execute(async (trx) => {
      const insertedRound = await trx
        .insertInto("rounds")
        .values({
          chainId,
          flowCouncilAddress: flowCouncilAddress.toLowerCase(),
          superappSplitterAddress: validatedSplitterAddress,
          details: JSON.stringify({
            name,
            description,
            logoUrl,
            // Omitting `listed` from the body leaves the new round unlisted
            // (missing/non-true = unlisted), mirroring the rounds PATCH route.
            ...(listed !== undefined ? { listed } : {}),
          }),
        })
        .returning([
          "id",
          "chainId",
          "flowCouncilAddress",
          "superappSplitterAddress",
          "details",
        ])
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
