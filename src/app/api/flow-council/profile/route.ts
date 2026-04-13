import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import {
  validateProfile,
  normalizeSocialHandle,
  MAX_DETAILS_SIZE,
} from "../validation";
import { readJsonBody, PayloadTooLargeError } from "../../utils";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = [
  "address",
  "displayName",
  "bio",
  "twitter",
  "github",
  "linkedin",
  "farcaster",
] as const;

const ALL_FIELDS = [...PUBLIC_FIELDS, "email", "telegram"] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const includePrivate = searchParams.get("includePrivate") === "true";

    if (!address || !isAddress(address)) {
      return jsonResponse({ success: false, error: "Invalid address" }, 400);
    }

    let isOwner = false;
    if (includePrivate) {
      const session = await getServerSession(authOptions);
      isOwner = session?.address?.toLowerCase() === address.toLowerCase();
    }

    const profile = await db
      .selectFrom("userProfiles")
      .select([...(isOwner ? ALL_FIELDS : PUBLIC_FIELDS)])
      .where("address", "=", address.toLowerCase())
      .executeTakeFirst();

    return jsonResponse({ success: true, profile: profile ?? null });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
    }

    let body: unknown;
    try {
      body = await readJsonBody(request, MAX_DETAILS_SIZE);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return jsonResponse({ success: false, error: "Payload too large" }, 413);
      }
      return jsonResponse({ success: false, error: "Invalid request body" }, 400);
    }
    const validation = validateProfile(body);

    if (!validation.success) {
      return jsonResponse({ success: false, error: validation.error }, 400);
    }

    const data = validation.data;

    const values = {
      address: session.address.toLowerCase(),
      displayName: data.displayName,
      bio: data.bio || null,
      twitter: data.twitter
        ? normalizeSocialHandle(data.twitter, "twitter")
        : null,
      github: data.github ? normalizeSocialHandle(data.github, "github") : null,
      linkedin: data.linkedin
        ? normalizeSocialHandle(data.linkedin, "linkedin")
        : null,
      farcaster: data.farcaster
        ? normalizeSocialHandle(data.farcaster, "farcaster")
        : null,
      email: data.email || null,
      telegram: data.telegram
        ? normalizeSocialHandle(data.telegram, "telegram")
        : null,
    };

    const profile = await db
      .insertInto("userProfiles")
      .values(values)
      .onConflict((oc) =>
        oc.column("address").doUpdateSet({
          displayName: values.displayName,
          bio: values.bio,
          twitter: values.twitter,
          github: values.github,
          linkedin: values.linkedin,
          farcaster: values.farcaster,
          email: values.email,
          telegram: values.telegram,
          updatedAt: new Date(),
        }),
      )
      .returning([...ALL_FIELDS])
      .executeTakeFirstOrThrow();

    return jsonResponse({ success: true, profile });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: false, error: "Unauthenticated" }, 401);
    }

    await db
      .deleteFrom("userProfiles")
      .where("address", "=", session.address.toLowerCase())
      .execute();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}
