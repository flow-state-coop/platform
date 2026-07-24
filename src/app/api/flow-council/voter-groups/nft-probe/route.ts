import { z } from "zod";
import { isAddress, Address } from "viem";
import { networks } from "@/lib/networks";
import { errorResponse } from "../../../utils";
import { authorizeCouncilManager } from "../../auth";
import { getCouncilPublicClient } from "../../metrics/lib";
import {
  detectNftStandard,
  verifyOverrideStandard,
  NFT_DETECTION_MESSAGES,
  type NftDetectionResult,
  type NftTokenStandard,
  type OverrideVerification,
} from "../../nft/detect";

export const dynamic = "force-dynamic";

const probeSchema = z.object({
  contractAddress: z.string().refine(isAddress, "Invalid contract address"),
  overrideStandard: z.enum(["erc721", "erc1155"]).optional(),
});

const DETECTED_MESSAGES: Record<NftTokenStandard, string> = {
  erc721: "ERC-721 collection detected",
  erc1155: "ERC-1155 collection detected",
};

const STANDARD_LABELS: Record<NftTokenStandard, string> = {
  erc721: "ERC-721",
  erc1155: "ERC-1155",
};

// Detection is only inconclusive enough to hand the decision to the admin in
// these two cases. read_failed says nothing about the contract and
// unreliable_erc165 says the contract lies about itself, so neither is
// overridable.
const OVERRIDABLE_STATUSES = ["no_erc165", "unsupported_interface"] as const;

function detectionMessage(detection: NftDetectionResult): string {
  return detection.status === "detected"
    ? DETECTED_MESSAGES[detection.standard]
    : NFT_DETECTION_MESSAGES[detection.status];
}

function standardMismatchMessage(
  detected: NftTokenStandard,
  submitted: NftTokenStandard,
): string {
  return `That contract is an ${STANDARD_LABELS[detected]} collection, not ${STANDARD_LABELS[submitted]}.`;
}

type ProbeResponse = {
  success: true;
  status: NftDetectionResult["status"];
  standard?: NftTokenStandard;
  collectionName?: string;
  message: string;
  overrideOk?: boolean;
  overrideReason?: "looks_like_token" | "missing_interface" | "read_failed";
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    // Garbage JSON is a caller mistake, not the server bug the outer catch's
    // 500 signals. Same contract as the eligibility routes.
    if (body === null || typeof body !== "object") {
      return errorResponse("Invalid request", 400);
    }

    const { chainId, councilId } = body;

    const auth = await authorizeCouncilManager(chainId, councilId);

    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const parsed = probeSchema.safeParse({
      contractAddress: body.contractAddress,
      overrideStandard: body.overrideStandard,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return errorResponse(issue.message, 400);
    }

    const network = networks.find((n) => n.id === chainId);

    if (!network) {
      return errorResponse("Wrong network", 400);
    }

    const contractAddress =
      parsed.data.contractAddress.toLowerCase() as Address;
    const client = getCouncilPublicClient(network);
    const detection = await detectNftStandard(client, contractAddress);

    const response: ProbeResponse = {
      success: true,
      status: detection.status,
      message: detectionMessage(detection),
    };

    if (detection.status === "detected") {
      response.standard = detection.standard;
      if (detection.collectionName) {
        response.collectionName = detection.collectionName;
      }
    }

    const { overrideStandard } = parsed.data;

    if (overrideStandard) {
      if (detection.status === "detected") {
        response.overrideOk = detection.standard === overrideStandard;
        if (!response.overrideOk) {
          response.message = standardMismatchMessage(
            detection.standard,
            overrideStandard,
          );
        }
      } else if (
        OVERRIDABLE_STATUSES.some((status) => status === detection.status)
      ) {
        const verification: OverrideVerification = await verifyOverrideStandard(
          client,
          contractAddress,
          overrideStandard,
        );

        response.overrideOk = verification.ok;

        if (!verification.ok) {
          response.overrideReason = verification.reason;
          response.message = NFT_DETECTION_MESSAGES[verification.reason];
        }
      } else {
        response.overrideOk = false;
      }
    }

    return Response.json(response);
  } catch (err) {
    // Raw provider errors carry endpoint URLs and keys, so the caller only ever
    // sees the mapped detection statuses above or this generic failure.
    console.error(err);
    return errorResponse("There was an error, please try again later", 500);
  }
}
