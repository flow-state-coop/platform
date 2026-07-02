import { parseEther } from "viem";
import { truncateAddress } from "@/lib/utils";

export const FLOW_STATE_MARKEE_ADDRESS =
  "0x8b6b33289c0C4aC55E7ae69382B10e071B0D3dEE" as const;
export const FLOW_STATE_MARKEE_URL = `https://markee.xyz/markee/${FLOW_STATE_MARKEE_ADDRESS}`;
export const MARKEE_NETWORK_URL = "https://markee.xyz";
export const MIN_INCREMENT = parseEther("0.001");
export const DEFAULT_TOP_MESSAGE =
  "Your message could be here. Buy the Flow State Markee.";
export const MONOSPACE_FONT = "'Courier New', Courier, monospace";

export type MarkeeLeaderboard = {
  topMessage: string;
  topMessageOwner: string;
  topFundsAdded: bigint;
  minimumPrice: bigint;
  topMarkeeAddress: string;
};

type LeaderboardsResponse = {
  leaderboards?: {
    address?: string;
    topMessage?: string | null;
    topMessageOwner?: string | null;
    topFundsAddedRaw?: string;
    minimumPrice?: string;
    minimumPriceRaw?: string;
    topMarkeeAddress?: string | null;
  }[];
};

export function parseFlowStateLeaderboard(
  data: unknown,
): MarkeeLeaderboard | null {
  try {
    const entry = (data as LeaderboardsResponse)?.leaderboards?.find(
      (leaderboard) =>
        leaderboard.address?.toLowerCase() ===
        FLOW_STATE_MARKEE_ADDRESS.toLowerCase(),
    );

    if (!entry) {
      return null;
    }

    return {
      topMessage: entry.topMessage ?? "",
      topMessageOwner: entry.topMessageOwner ?? "",
      topFundsAdded: BigInt(entry.topFundsAddedRaw ?? "0"),
      minimumPrice: entry.minimumPriceRaw
        ? BigInt(entry.minimumPriceRaw)
        : parseEther(entry.minimumPrice ?? "0.001"),
      topMarkeeAddress: entry.topMarkeeAddress ?? "",
    };
  } catch {
    return null;
  }
}

export function displayOwnerName(owner: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(owner) ? truncateAddress(owner) : owner;
}

export function flaggedKey(markeeAddress: string) {
  return `8453:${markeeAddress.toLowerCase()}`;
}
