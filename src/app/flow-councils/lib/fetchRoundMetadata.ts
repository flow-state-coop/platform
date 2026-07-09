import { isAddress, type Address } from "viem";
import { type RoundSocialConfig } from "@/app/flow-councils/lib/socialShare";

export type RoundMetadata = {
  name: string;
  description: string;
  logoUrl: string;
  superappSplitterAddress: Address | null;
  applicationsClosed: boolean;
  social: RoundSocialConfig | null;
};

const DEFAULT_METADATA: RoundMetadata = {
  name: "Flow Council",
  description: "",
  logoUrl: "",
  superappSplitterAddress: null,
  applicationsClosed: false,
  social: null,
};

export async function fetchRoundMetadata(
  chainId: number,
  councilAddress: string,
): Promise<RoundMetadata> {
  try {
    const res = await fetch(
      `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilAddress}`,
    );
    const data = await res.json();

    if (data.success && data.round) {
      const details = data.round.details
        ? typeof data.round.details === "string"
          ? JSON.parse(data.round.details)
          : data.round.details
        : null;

      const raw = data.round.superappSplitterAddress;
      const splitter: Address | null =
        typeof raw === "string" && isAddress(raw) ? raw : null;

      return {
        name: details?.name ?? DEFAULT_METADATA.name,
        description: details?.description ?? DEFAULT_METADATA.description,
        logoUrl: details?.logoUrl ?? DEFAULT_METADATA.logoUrl,
        superappSplitterAddress: splitter,
        applicationsClosed: data.round.applicationsClosed ?? false,
        social: details?.social ?? null,
      };
    }
  } catch (err) {
    console.error(err);
  }

  return DEFAULT_METADATA;
}
