import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import { MAX_DETAILS_SIZE } from "../validation";
import { networks } from "@/lib/networks";

const roundPatchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  logoUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return ["http:", "https:"].includes(u.protocol);
        } catch {
          return false;
        }
      },
      { message: "logoUrl must be an http(s) URL" },
    )
    .optional()
    .or(z.literal("")),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const flowCouncilAddress = searchParams.get("flowCouncilAddress");

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return errorResponse("Invalid network", 400);
    }

    if (!flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return errorResponse("Invalid flow council address", 400);
    }

    const round = await db
      .selectFrom("rounds")
      .select([
        "id",
        "chainId",
        "flowCouncilAddress",
        "superappSplitterAddress",
        "applicationsClosed",
        "details",
      ])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    return new Response(
      JSON.stringify({ success: true, round: round ?? null }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch round" }),
    );
  }
}

export async function PATCH(request: Request) {
  try {
    let body: {
      chainId?: number;
      flowCouncilAddress?: string;
      superappSplitterAddress?: string;
    };
    try {
      body = await readJsonBody(request, MAX_DETAILS_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return errorResponse("Payload too large", 413);
      }
      return errorResponse("Invalid request body", 400);
    }
    const { chainId, flowCouncilAddress, superappSplitterAddress } = body;

    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return errorResponse("Unauthenticated", 401);
    }

    if (typeof chainId !== "number") {
      return errorResponse("Invalid network", 400);
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return errorResponse("Invalid network", 400);
    }

    if (!flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return errorResponse("Invalid flow council address", 400);
    }

    const parsed = roundPatchSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid round data",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { name, description, logoUrl } = parsed.data;

    const round = await db
      .selectFrom("rounds")
      .innerJoin("roundAdmins", "rounds.id", "roundAdmins.roundId")
      .select(["rounds.id", "rounds.details"])
      .where("rounds.chainId", "=", chainId)
      .where("rounds.flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .where("roundAdmins.adminAddress", "=", session.address.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Round not found or not authorized",
        }),
      );
    }

    const validatedSplitterAddress =
      superappSplitterAddress && isAddress(superappSplitterAddress)
        ? superappSplitterAddress.toLowerCase()
        : undefined;

    const existingDetails =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    const mergedDetails = { ...existingDetails, name, description, logoUrl };

    const updatedRound = await db
      .updateTable("rounds")
      .set({
        details: JSON.stringify(mergedDetails),
        ...(validatedSplitterAddress
          ? { superappSplitterAddress: validatedSplitterAddress }
          : {}),
        updatedAt: new Date(),
      })
      .where("id", "=", round.id)
      .returning([
        "id",
        "chainId",
        "flowCouncilAddress",
        "superappSplitterAddress",
        "details",
      ])
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify({ success: true, round: updatedRound }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to update round" }),
    );
  }
}
