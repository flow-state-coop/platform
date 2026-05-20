import { getServerSession } from "next-auth/next";
import { isAddress } from "viem";
import { sql, type Insertable, type Updateable } from "kysely";
import { db } from "../db";
import type { DB } from "@/generated/kysely";
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

// NOTE: `emailVersion` is intentionally excluded from any response — it is
// internal-only state used for token invalidation and must never be exposed
// to clients.
const ALL_FIELDS = [
  ...PUBLIC_FIELDS,
  "email",
  "telegram",
  "consentConfirmedAt",
  "consentVersion",
  "notifyApplicationEligibility",
  "notifyProjectChannels",
  "notifyRoundAnnouncements",
  "notifyInternalReview",
  "notifyPlatform",
  "emailSuspendedAt",
  "emailSuspensionReason",
] as const;

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
    const validation = validateProfile(body);

    if (!validation.success) {
      return jsonResponse({ success: false, error: validation.error }, 400);
    }

    const data = validation.data;
    const address = session.address.toLowerCase();

    // Read-before-write: we need the current email + consent state to
    // detect transitions that must bump `email_version` (invalidating any
    // outstanding unsubscribe/preference tokens). NOTE: this is NOT
    // transaction-wrapped, so two concurrent PUTs could both observe the
    // pre-bump state and only bump once. Acceptable at current scale; the
    // raw SQL increment below keeps the bump itself atomic.
    const currentRow = await db
      .selectFrom("userProfiles")
      .select(["email", "emailVersion", "consentConfirmedAt"])
      .where("address", "=", address)
      .executeTakeFirst();

    // `|| null` (not `?? null`) is deliberate: it coerces an empty-string
    // email to null so it matches `currentRow.email`, which is always stored
    // as null (never "") thanks to the same normalization on write. The two
    // operators are not equivalent in general — keep them aligned here.
    const normalizedEmail = data.email || null;
    const newConsentConfirmedAt =
      data.consentConfirmedAt === undefined
        ? undefined
        : data.consentConfirmedAt === null
          ? null
          : new Date(data.consentConfirmedAt);

    // Transition 1: email change (treat null === null as no-change).
    const emailChanged =
      currentRow !== undefined && normalizedEmail !== (currentRow.email ?? null);

    // Transition 2: consent revocation (had consent → explicit null).
    // `undefined` means "field omitted" — must NOT count as revocation, or any
    // PUT that doesn't send `consentConfirmedAt` would silently bump
    // `emailVersion` and invalidate outstanding prefs/unsubscribe tokens.
    const consentRevoked =
      currentRow?.consentConfirmedAt != null &&
      data.consentConfirmedAt === null;

    const shouldBumpEmailVersion = emailChanged || consentRevoked;

    const baseValues = {
      address,
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
      email: normalizedEmail,
      telegram: data.telegram
        ? normalizeSocialHandle(data.telegram, "telegram")
        : null,
    };

    // Build the update set. Fields that came through as `undefined` in the
    // request body are omitted so existing values are preserved.
    const updateSet: Updateable<DB["userProfiles"]> = {
      ...baseValues,
      updatedAt: new Date(),
    };
    // Insert payload starts from baseValues; consent + notification fields are
    // merged in below so a brand-new user who sets them on first save doesn't
    // silently fall back to DB defaults (this branch only runs the updateSet
    // on conflict, not on insert).
    const values: Insertable<DB["userProfiles"]> = { ...baseValues };

    if (data.consentConfirmedAt !== undefined) {
      updateSet.consentConfirmedAt = newConsentConfirmedAt;
      values.consentConfirmedAt = newConsentConfirmedAt;
    }
    if (data.consentVersion !== undefined) {
      updateSet.consentVersion = data.consentVersion;
      values.consentVersion = data.consentVersion;
    }
    if (data.notifyApplicationEligibility !== undefined) {
      updateSet.notifyApplicationEligibility = data.notifyApplicationEligibility;
      values.notifyApplicationEligibility = data.notifyApplicationEligibility;
    }
    if (data.notifyProjectChannels !== undefined) {
      updateSet.notifyProjectChannels = data.notifyProjectChannels;
      values.notifyProjectChannels = data.notifyProjectChannels;
    }
    if (data.notifyRoundAnnouncements !== undefined) {
      updateSet.notifyRoundAnnouncements = data.notifyRoundAnnouncements;
      values.notifyRoundAnnouncements = data.notifyRoundAnnouncements;
    }
    if (data.notifyInternalReview !== undefined) {
      updateSet.notifyInternalReview = data.notifyInternalReview;
      values.notifyInternalReview = data.notifyInternalReview;
    }
    if (data.notifyPlatform !== undefined) {
      updateSet.notifyPlatform = data.notifyPlatform;
      values.notifyPlatform = data.notifyPlatform;
    }

    // On email change, clear any prior bounce suspension since the user has
    // provided a fresh address.
    if (emailChanged) {
      updateSet.emailSuspendedAt = null;
      updateSet.emailSuspensionReason = null;
    }

    if (shouldBumpEmailVersion) {
      // Atomic increment at the SQL level. The column must be qualified —
      // inside `ON CONFLICT ... DO UPDATE SET`, an unqualified `email_version`
      // is ambiguous (target row vs. EXCLUDED tuple) and Postgres aborts with
      // 42702. `user_profiles.email_version` is the pre-update value, which
      // is what we want to increment.
      updateSet.emailVersion = sql<number>`user_profiles.email_version + 1` as unknown as number;
    }

    const profile = await db
      .insertInto("userProfiles")
      .values(values)
      .onConflict((oc) => oc.column("address").doUpdateSet(updateSet))
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
