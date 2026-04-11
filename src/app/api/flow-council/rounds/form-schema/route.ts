import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { isAdmin } from "../../auth";
import { validateFormSchema, MAX_DETAILS_SIZE } from "../../validation";
import { readJsonBody, PayloadTooLargeError } from "../../../utils";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = Number(searchParams.get("chainId"));
    const flowCouncilAddress = searchParams.get("flowCouncilAddress");

    if (!chainId || !flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return jsonResponse({ success: false, error: "Invalid parameters" }, 400);
    }

    const round = await db
      .selectFrom("rounds")
      .select(["details"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return jsonResponse({ success: false, error: "Round not found" }, 404);
    }

    const details =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    return jsonResponse({
      success: true,
      formSchema: details.formSchema ?? null,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { success: false, error: "Failed to fetch form schema" },
      500,
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
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
        return jsonResponse(
          { success: false, error: "Payload too large" },
          413,
        );
      }
      return jsonResponse(
        { success: false, error: "Invalid request body" },
        400,
      );
    }
    const { chainId, flowCouncilAddress, formSchema } = parsed;

    if (!chainId || !flowCouncilAddress || !isAddress(flowCouncilAddress)) {
      return jsonResponse({ success: false, error: "Invalid parameters" }, 400);
    }

    const round = await db
      .selectFrom("rounds")
      .select(["id", "details"])
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", flowCouncilAddress.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return jsonResponse({ success: false, error: "Round not found" }, 404);
    }

    const authorized = await isAdmin(
      round.id,
      chainId,
      flowCouncilAddress,
      session.address,
    );

    if (!authorized) {
      return jsonResponse({ success: false, error: "Not authorized" }, 403);
    }

    const validation = validateFormSchema(formSchema);

    if (!validation.success) {
      return jsonResponse({ success: false, error: validation.error }, 400);
    }

    // Read-merge-write to preserve other details keys
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

    return jsonResponse({
      success: true,
      formSchema: validation.data,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { success: false, error: "Failed to save form schema" },
      500,
    );
  }
}
