export type RoundMetadata = {
  name: string;
  description: string;
  logoUrl: string;
};

const DEFAULT_METADATA: RoundMetadata = {
  name: "Flow Council",
  description: "",
  logoUrl: "",
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

      return {
        name: details?.name ?? DEFAULT_METADATA.name,
        description: details?.description ?? DEFAULT_METADATA.description,
        logoUrl: details?.logoUrl ?? DEFAULT_METADATA.logoUrl,
      };
    }
  } catch (err) {
    console.error(err);
  }

  return DEFAULT_METADATA;
}
