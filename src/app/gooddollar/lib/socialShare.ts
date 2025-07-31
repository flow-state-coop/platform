export function getSocialShare({ councilUiLink }: { councilUiLink: string }) {
  return {
    twitter:
      "https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20donation" +
      "%20stream%20to%20the%20%40gooddollarorg%20Flow%20Council%20on%20%40" +
      "flowstatecoop.%0A%0AStream%20G%24%20to%20earn%20your%20share%20of%201M" +
      "%20%24SUP%20from%20%40Superfluid_HQ%3A%20" +
      `${encodeURIComponent(councilUiLink)}` +
      "&url=https://x.com/gooddollarorg/status/1936092432061362416",
    farcaster:
      "https://farcaster.xyz/~/compose?text=I%20just%20opened%20a%20" +
      "donation%20stream%20to%20the%20%40gooddollar%20Flow%20Council%20on%20" +
      "%40flowstatecoop.%20Stream%20G%24%20to%20earn%20your%20share%20of%201M" +
      `%20%24SUP%20from%20%40superfluid%3A%20&embeds[]=${councilUiLink}`,
    lens:
      "https://hey.xyz/?text=I%20just%20opened%20a%20donation%20stream%20to" +
      "%20the%20GoodBuilders%20Flow%20Council%20on%20%40flowstatecoop.%20" +
      "Stream%20G%24%20to%20earn%20your%20share%20of%201M%20%24SUP%20from%20" +
      `%40superfluid%3A%20${encodeURIComponent(councilUiLink)}`,
  };
}
