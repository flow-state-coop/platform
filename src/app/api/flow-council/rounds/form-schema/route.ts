import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../../db";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { isAdmin } from "../../auth";
import { validateFormSchema } from "../../validation";

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

    const { chainId, flowCouncilAddress, formSchema } = await request.json();

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

    const oldFormSchema = existingDetails?.formSchema;
    const collectIds = (schema: unknown): Set<string> => {
      const ids = new Set<string>();
      const s = schema as
        | { round?: { id: string }[]; attestation?: { id: string }[] }
        | undefined;
      for (const el of s?.round ?? []) ids.add(el.id);
      for (const el of s?.attestation ?? []) ids.add(el.id);
      return ids;
    };

    const oldIds = collectIds(oldFormSchema);
    const newIds = collectIds(validation.data);
    const removedIds = [...oldIds].filter((id) => !newIds.has(id));

    await db
      .updateTable("rounds")
      .set({
        details: JSON.stringify(mergedDetails),
        updatedAt: new Date(),
      })
      .where("id", "=", round.id)
      .execute();

    if (removedIds.length > 0) {
      const applications = await db
        .selectFrom("applications")
        .select(["id", "details"])
        .where("roundId", "=", round.id)
        .execute();

      for (const app of applications) {
        const appDetails =
          typeof app.details === "string"
            ? JSON.parse(app.details)
            : (app.details ?? {});

        if (!appDetails || typeof appDetails !== "object") continue;

        let changed = false;
        for (const removedId of removedIds) {
          if (removedId in appDetails) {
            delete appDetails[removedId];
            changed = true;
          }
        }

        if (changed) {
          await db
            .updateTable("applications")
            .set({ details: appDetails, updatedAt: new Date() })
            .where("id", "=", app.id)
            .execute();
        }
      }
    }

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
