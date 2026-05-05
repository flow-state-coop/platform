import { isAddress, type Address } from "viem";

export type RoundMetadata = {
  name: string;
  description: string;
  logoUrl: string;
  superappSplitterAddress: Address | null;
};

const DEFAULT_METADATA: RoundMetadata = {
  name: "Flow Council",
  description: "",
  logoUrl: "",
  superappSplitterAddress: null,
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

    if (data.success && data.round?.details) {
      const details =
        typeof data.round.details === "string"
          ? JSON.parse(data.round.details)
          : data.round.details;

      const raw = data.round.superappSplitterAddress;
      const splitter: Address | null =
        typeof raw === "string" && isAddress(raw) ? raw : null;

      return {
        name: details?.name ?? DEFAULT_METADATA.name,
        description: details?.description ?? DEFAULT_METADATA.description,
        logoUrl: details?.logoUrl ?? DEFAULT_METADATA.logoUrl,
        superappSplitterAddress: splitter,
      };
    }
  } catch (err) {
    console.error(err);
  }

  return DEFAULT_METADATA;
}
