export function getSocialShare({
  councilName,
  councilUiLink,
}: {
  councilName: string;
  councilUiLink: string;
}) {
  return {
    twitter:
      "https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20" +
      `stream%20to%20the%20${councilName}%20distribution%20pool%20on%20Flow%20` +
      `State.%0AJoin%20me%20in%20supporting%20these%20builders%3A%20${encodeURIComponent(councilUiLink)}`,
    farcaster:
      "https://farcaster.xyz/~/compose?text=I+just+opened+a+stream+to+" +
      `the+${councilName}+distribution+pool+on+Flow+State.%0AJoin+me+in+` +
      "supporting+these+builders%3A" +
      `&embeds[]=${encodeURIComponent(councilUiLink)}`,
    lens:
      `https://hey.xyz/?text=I+just+opened+a+stream+to+the+${councilName}+` +
      `distribution+pool+on+Flow+State.%0AJoin+me+in+supporting+these+builders%3A+${encodeURIComponent(councilUiLink)}`,
  };
}

export function getVoteSocialShare({
  councilName,
  councilUiLink,
}: {
  councilName: string;
  councilUiLink: string;
}) {
  return {
    twitter:
      "https://twitter.com/intent/tweet?text=I%20just%20voted%20in%20the%20" +
      `${councilName}%20on%20Flow%20State.%0AJoin%20me%20in%20supporting%20` +
      `these%20builders%3A%20${encodeURIComponent(councilUiLink)}`,
    farcaster:
      "https://farcaster.xyz/~/compose?text=I+just+voted+in+the+" +
      `${councilName}+on+Flow+State.%0AJoin+me+in+supporting+these+builders%3A` +
      `&embeds[]=${encodeURIComponent(councilUiLink)}`,
    lens:
      `https://hey.xyz/?text=I+just+voted+in+the+${councilName}+on+Flow+` +
      `State.%0AJoin+me+in+supporting+these+builders%3A+` +
      encodeURIComponent(councilUiLink),
  };
}
