import { networks } from "@/lib/networks";
import { Network } from "@/types/network";

type GardensPoolParsed = {
  chainId: number;
  communityAddress: string;
  poolAddress: string;
};

export function parseGardensPoolUrl(url: string): GardensPoolParsed | null {
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(normalized);

    if (parsed.hostname !== "app.gardens.fund") {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);

    if (segments.length < 4 || segments[0] !== "gardens") {
      return null;
    }

    const chainId = Number(segments[1]);

    if (isNaN(chainId) || chainId <= 0) {
      return null;
    }

    const communityAddress = segments[2];
    const poolAddress = segments[3];

    if (!communityAddress.startsWith("0x") || !poolAddress.startsWith("0x")) {
      return null;
    }

    return { chainId, communityAddress, poolAddress };
  } catch {
    return null;
  }
}

export function getGardensPoolNetwork(url: string): Network | null {
  const parsed = parseGardensPoolUrl(url);

  if (!parsed) {
    return null;
  }

  return networks.find((n) => n.id === parsed.chainId) ?? null;
}
