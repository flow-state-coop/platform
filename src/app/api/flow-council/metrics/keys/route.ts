import { z } from "zod";
import { isAddress } from "viem";
import { networks } from "@/lib/networks";
import { db } from "../../db";
import {
  errorResponse,
  readJsonBody,
  PayloadTooLargeError,
} from "../../../utils";
import { authorizeCouncilManager } from "../../auth";
import { metricsKeyCreateSchema } from "../../validation";
import { getMetricsGroup, generateApiKey } from "../lib";

export const dynamic = "force-dynamic";

const queryParamsSchema = z.object({
  chainId: z.coerce
    .number()
    .refine((id) => networks.some((n) => n.id === id), "Wrong network"),
  councilId: z.string().refine(isAddress, "Invalid council ID"),
});

const MAX_BODY_SIZE = 4 * 1024;

async function parseBody(request: Request) {
  try {
    return {
      ok: true as const,
      body: await readJsonBody(request, MAX_BODY_SIZE),
    };
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return { ok: false as const, response: errorResponse(err.message, 413) };
    }
    return {
      ok: false as const,
      response: errorResponse("Invalid request body", 400),
    };
  }
}

// List the council's metrics API keys (never the hash or plaintext).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = queryParamsSchema.safeParse({
      chainId: searchParams.get("chainId"),
      councilId: searchParams.get("councilId"),
    });

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const auth = await authorizeCouncilManager(
      parsed.data.chainId,
      parsed.data.councilId,
    );

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const group = await getMetricsGroup(auth.roundId);
    if (!group) {
      return Response.json({ success: true, keys: [] });
    }

    const keys = await db
      .selectFrom("metricsApiKeys")
      .select([
        "id",
        "label",
        "keyPrefix",
        "lastUsedAt",
        "revokedAt",
        "createdAt",
      ])
      .where("voterGroupId", "=", group.id)
      .orderBy("id", "asc")
      .execute();

    return Response.json({ success: true, keys });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

// Mint a new key. The plaintext token is returned exactly once.
export async function POST(request: Request) {
  try {
    const parsedBody = await parseBody(request);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const params = queryParamsSchema.safeParse(parsedBody.body);
    if (!params.success) {
      return errorResponse(params.error.issues[0].message, 400);
    }

    const parsed = metricsKeyCreateSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const auth = await authorizeCouncilManager(
      params.data.chainId,
      params.data.councilId,
    );
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const group = await getMetricsGroup(auth.roundId);
    if (!group) {
      return errorResponse("This council has no metrics voter group", 409);
    }

    const { token, hash, prefix } = generateApiKey();

    const inserted = await db
      .insertInto("metricsApiKeys")
      .values({
        roundId: auth.roundId,
        voterGroupId: group.id,
        keyHash: hash,
        keyPrefix: prefix,
        label: parsed.data.label,
      })
      .returning(["id", "label", "keyPrefix", "createdAt"])
      .executeTakeFirst();

    return Response.json({ success: true, key: { ...inserted, token } });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

// Soft-revoke a key (keeps the row for audit; the ballot route treats a revoked
// key as missing).
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return errorResponse("Invalid key id", 400);
    }

    const params = queryParamsSchema.safeParse({
      chainId: searchParams.get("chainId"),
      councilId: searchParams.get("councilId"),
    });
    if (!params.success) {
      return errorResponse(params.error.issues[0].message, 400);
    }

    const auth = await authorizeCouncilManager(
      params.data.chainId,
      params.data.councilId,
    );
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const result = await db
      .updateTable("metricsApiKeys")
      .set({ revokedAt: new Date() })
      .where("id", "=", id)
      .where("roundId", "=", auth.roundId)
      .where("revokedAt", "is", null)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      return errorResponse("Key not found", 404);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
