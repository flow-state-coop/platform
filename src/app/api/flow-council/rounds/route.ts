import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { isAddress } from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { errorResponse, readJsonBody, PayloadTooLargeError } from "../../utils";
import {
  MAX_DETAILS_SIZE,
  extractSocialHandle,
  socialConfigSchema,
} from "../validation";
import { deleteObjectByPublicUrl } from "../s3";
import {
  getEffectiveCharCount,
  X_CHAR_LIMIT,
  FARCASTER_CHAR_LIMIT,
} from "@/app/flow-councils/lib/socialShare";
import { networks } from "@/lib/networks";

const roundPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
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
  listed: z.boolean().optional(),
  social: socialConfigSchema.optional(),
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
    const { name, description, logoUrl, listed, social } = parsed.data;

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
        { status: 403, headers: { "Content-Type": "application/json" } },
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

    const normalizedSocial =
      social === undefined
        ? undefined
        : {
            ...social,
            shareImageUrl:
              social.shareImageUrl === undefined
                ? existingDetails?.social?.shareImageUrl
                : social.shareImageUrl,
            accounts: social.accounts.map((account) => {
              const xHandle = account.xHandle
                ? extractSocialHandle(account.xHandle, "twitter")
                : "";
              const farcasterHandle = account.farcasterHandle
                ? extractSocialHandle(account.farcasterHandle, "farcaster")
                : "";

              return {
                id: account.id,
                name: account.name,
                ...(xHandle ? { xHandle } : {}),
                ...(farcasterHandle ? { farcasterHandle } : {}),
              };
            }),
          };

    if (normalizedSocial) {
      const shareContext = {
        roundName: name ?? existingDetails.name ?? "",
        roundLink: `https://flowstate.network/flow-councils/${chainId}/${flowCouncilAddress.toLowerCase()}`,
        accounts: normalizedSocial.accounts,
      };
      const messages = [
        { label: "Vote message", template: normalizedSocial.voteMessage },
        {
          label: "Donation message",
          template: normalizedSocial.donationMessage,
        },
      ];
      const platforms = [
        { platform: "x", label: "X", limit: X_CHAR_LIMIT },
        {
          platform: "farcaster",
          label: "Farcaster",
          limit: FARCASTER_CHAR_LIMIT,
        },
      ] as const;

      for (const { label, template } of messages) {
        if (!template?.trim()) continue;

        for (const { platform, label: platformLabel, limit } of platforms) {
          const count = getEffectiveCharCount(template, platform, shareContext);

          if (count > limit) {
            return errorResponse(
              `${label} exceeds the ${platformLabel} limit (${count}/${limit})`,
              400,
            );
          }
        }
      }
    }

    const previousShareImageUrl = existingDetails?.social?.shareImageUrl;

    // Omitting a field from the PATCH leaves the existing value untouched.
    const mergedDetails = {
      ...existingDetails,
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      ...(listed !== undefined ? { listed } : {}),
      ...(normalizedSocial !== undefined ? { social: normalizedSocial } : {}),
    };

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

    // Deletes are scoped to the caller's own share-images prefix so a stored
    // URL pointing at another user's object can never trigger its deletion.
    const s3PublicUrl = process.env.AWS_S3_PUBLIC_URL;
    const callerShareImagePrefix = `${s3PublicUrl}/share-images/${session.address.toLowerCase()}/`;

    if (
      s3PublicUrl &&
      normalizedSocial !== undefined &&
      typeof previousShareImageUrl === "string" &&
      previousShareImageUrl !== normalizedSocial.shareImageUrl &&
      previousShareImageUrl.startsWith(callerShareImagePrefix)
    ) {
      try {
        await deleteObjectByPublicUrl(previousShareImageUrl);
      } catch (err) {
        console.error(err);
      }
    }

    return new Response(JSON.stringify({ success: true, round: updatedRound }));
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to update round" }),
    );
  }
}
