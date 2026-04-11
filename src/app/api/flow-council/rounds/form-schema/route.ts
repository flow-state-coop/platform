import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { isAdmin } from "../../auth";
import { validateFormSchema, MAX_DETAILS_SIZE } from "../../validation";
import {
  errorResponse,
  readJsonBody,
  PayloadTooLargeError,
} from "../../../utils";

export const dynamic = "force-dynamic";

function successResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ success: true, ...body }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const flowCouncilAddress = searchParams.get("flowCouncilAddress");

    if (!chainId || !flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return errorResponse("Invalid parameters", 400);
    }

    const round = await db
      .selectFrom("rounds")
      .select(["details"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return errorResponse("Round not found", 404);
    }

    const details =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    return successResponse({ formSchema: details.formSchema ?? null });
  } catch (err) {
    console.error(err);
    return errorResponse("Failed to fetch form schema", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return errorResponse("Unauthenticated", 401);
    }

    let parsed: {
      chainId?: number;
      flowCouncilAddress?: string;
      formSchema?: unknown;
    };
    try {
      parsed = await readJsonBody(request, MAX_DETAILS_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return errorResponse("Payload too large", 413);
      }
      return errorResponse("Invalid request body", 400);
    }
    const { chainId, flowCouncilAddress, formSchema } = parsed;

    if (!chainId || !flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return errorResponse("Invalid parameters", 400);
    }

    const round = await db
      .selectFrom("rounds")
      .select(["id", "details"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return errorResponse("Round not found", 404);
    }

    const authorized = await isAdmin(
      round.id,
      chainId,
      flowCouncilAddress,
      session.address,
    );

    if (!authorized) {
      return errorResponse("Not authorized", 403);
    }

    const validation = validateFormSchema(formSchema);

    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const existingDetails =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    const mergedDetails = { ...existingDetails, formSchema: validation.data };

    await db
      .updateTable("rounds")
      .set({
        details: JSON.stringify(mergedDetails),
        updatedAt: new Date(),
      })
      .where("id", "=", round.id)
      .execute();

    return successResponse({ formSchema: validation.data });
  } catch (err) {
    console.error(err);
    return errorResponse("Failed to save form schema", 500);
  }
}
