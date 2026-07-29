import { db } from "../../db";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import { generateApiKey } from "../../apiKeys";
import { authorizePoolAdmin } from "../auth";
import { splitterKeyCreateSchema, splitterQuerySchema } from "../validation";

export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 4 * 1024;
const MAX_ACTIVE_KEYS_PER_POOL = 10;
const KEY_NAMESPACE = "splitter_";

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

// List a pool's API keys (never the hash or the plaintext).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = splitterQuerySchema.safeParse({
      chainId: searchParams.get("chainId"),
      poolId: searchParams.get("poolId"),
    });

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const auth = await authorizePoolAdmin(
      parsed.data.chainId,
      parsed.data.poolId,
      { allowCachedRole: true },
    );
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const keys = await db
      .selectFrom("splitterApiKeys")
      .select([
        "id",
        "label",
        "keyPrefix",
        "lastUsedAt",
        "revokedAt",
        "createdAt",
      ])
      .where("chainId", "=", parsed.data.chainId)
      .where("poolId", "=", parsed.data.poolId)
      .orderBy("id", "asc")
      .execute();

    // No bot-admin status here: the admin page reads it from the chain itself,
    // because it has to show it before anyone signs in.
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

    const params = splitterQuerySchema.safeParse(parsedBody.body);
    if (!params.success) {
      return errorResponse(params.error.issues[0].message, 400);
    }

    const parsed = splitterKeyCreateSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { chainId, poolId } = params.data;

    const auth = await authorizePoolAdmin(chainId, poolId);
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const { token, hash, prefix } = generateApiKey(KEY_NAMESPACE);

    // Count and insert in one transaction, holding a lock on the pool's
    // integration row. There is no DB constraint on the active-key count, so
    // without it two concurrent mints could both read count < cap and both
    // insert. The row is upserted first because a pool that has never minted a
    // key has nothing to lock.
    const inserted = await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("splitterIntegrations")
        .values({ chainId, poolId })
        .onConflict((oc) => oc.columns(["chainId", "poolId"]).doNothing())
        .execute();

      await trx
        .selectFrom("splitterIntegrations")
        .select("poolId")
        .where("chainId", "=", chainId)
        .where("poolId", "=", poolId)
        .forUpdate()
        .executeTakeFirst();

      const activeKeys = await trx
        .selectFrom("splitterApiKeys")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("chainId", "=", chainId)
        .where("poolId", "=", poolId)
        .where("revokedAt", "is", null)
        .executeTakeFirst();

      if (Number(activeKeys?.count ?? 0) >= MAX_ACTIVE_KEYS_PER_POOL) {
        return null;
      }

      return trx
        .insertInto("splitterApiKeys")
        .values({
          chainId,
          poolId,
          keyHash: hash,
          keyPrefix: prefix,
          label: parsed.data.label,
        })
        .returning(["id", "label", "keyPrefix", "createdAt"])
        .executeTakeFirst();
    });

    if (!inserted) {
      return errorResponse(
        `This pool has reached the limit of ${MAX_ACTIVE_KEYS_PER_POOL} active keys. Revoke an existing key before minting a new one.`,
        409,
      );
    }

    return Response.json({ success: true, key: { ...inserted, token } });
  } catch (err) {
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}

// Soft-revoke a key. The row is kept for audit, and the write path treats a
// revoked key as missing. A job already accepted is not cancelled.
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return errorResponse("Invalid key id", 400);
    }

    const params = splitterQuerySchema.safeParse({
      chainId: searchParams.get("chainId"),
      poolId: searchParams.get("poolId"),
    });
    if (!params.success) {
      return errorResponse(params.error.issues[0].message, 400);
    }

    const auth = await authorizePoolAdmin(
      params.data.chainId,
      params.data.poolId,
    );
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const result = await db
      .updateTable("splitterApiKeys")
      .set({ revokedAt: new Date() })
      .where("id", "=", id)
      .where("chainId", "=", params.data.chainId)
      .where("poolId", "=", params.data.poolId)
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
