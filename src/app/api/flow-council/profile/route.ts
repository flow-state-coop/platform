import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { validateProfile, normalizeSocialHandle } from "../validation";

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const includePrivate = searchParams.get("includePrivate") === "true";

    if (!address || !isAddress(address)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid address" }),
      );
    }

    const session = await getServerSession(authOptions);
    const isOwner =
      includePrivate &&
      session?.address?.toLowerCase() === address.toLowerCase();

    const profile = await db
      .selectFrom("userProfiles")
      .select([...(isOwner ? ALL_FIELDS : PUBLIC_FIELDS)])
      .where("address", "=", address.toLowerCase())
      .executeTakeFirst();

    return new Response(
      JSON.stringify({ success: true, profile: profile ?? null }),
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    const body = await request.json();
    const validation = validateProfile(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
      );
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

    return new Response(JSON.stringify({ success: true, profile }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    await db
      .deleteFrom("userProfiles")
      .where("address", "=", session.address.toLowerCase())
      .execute();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error" }),
    );
  }
}
