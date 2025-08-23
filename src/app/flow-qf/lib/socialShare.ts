export function getSocialShare({
  isFundingDistributionPool,
  granteeName = "",
  granteeTwitter = "",
  granteeFarcaster = "",
  roundName,
  roundLink,
}: {
  isFundingDistributionPool?: boolean;
  granteeName?: string;
  granteeTwitter?: string;
  granteeFarcaster?: string;
  roundName: string;
  roundLink: string;
}) {
  return {
    twitter:
      "https://twitter.com/intent/tweet?text=I%20opened%20a%20stream%20to%20" +
      `${
        isFundingDistributionPool
          ? "the matching pool"
          : granteeTwitter
            ? granteeTwitter
            : granteeName
      }%20in%20the%20${
        roundName === "Octant Builder Accelerator"
          ? "%40OctantApp%20Builder%20Accelerator"
          : roundName
      }` +
      "%20SQF%20round%20on%20%40flowstatecoop.%0A%0AI%27m%20earning%20" +
      "%40Superfluid_HQ%20%24SUP%20every%20second%20for%20supporting%20" +
      `public%20goods.%0A%0AYou%20can%20too%20%F0%9F%91%87%3A%20${roundLink}` +
      `&url=https://x.com/flowstatecoop/status/1909243251246104641`,
    farcaster:
      "https://farcaster.xyz/~/compose?text=I%20opened%20a%20stream" +
      `%20to%20${
        isFundingDistributionPool
          ? "the matching pool"
          : granteeFarcaster
            ? granteeFarcaster
            : granteeName
      }` +
      `%20in%20the%20${
        roundName === "Octant Builder Accelerator"
          ? "@octant%20Builder%20Accelerator"
          : roundName
      }` +
      "%20SQF%20round%20on%20@flowstatecoop.%0A%0AI%27m%20earning%20@superfluid" +
      "%20%24SUP%20every%20second%20for%20supporting%20public%20goods.%0A%0AYou" +
      "%20can%20too%F0%9F%91%87%3A" +
      "&embeds[]=https://farcaster.xyz/flowstatecoop/0x87385e01" +
      `&embeds[]=${roundLink}`,
    lens:
      "https://hey.xyz/?text=I+opened%20a%20stream%20to%20" +
      `${isFundingDistributionPool ? "the matching pool" : granteeName}%20in` +
      `%20the%20${roundName}%20SQF%20round%20on%20Flow%20State.%0A%0AI%27m` +
      "%20earning%20%40Superfluid%20%24SUP%20every%20second%20for%20" +
      "supporting%20public%20goods.%20You%20can%20too%F0%9F%91%87%3A%0A" +
      `${encodeURIComponent(roundLink)}`,
  };
}
