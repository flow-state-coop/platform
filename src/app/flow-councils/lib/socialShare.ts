export function getSocialShare({
  flowCouncilName,
  flowCouncilUiLink,
}: {
  flowCouncilName: string;
  flowCouncilUiLink: string;
}) {
  return {
    twitter:
      "https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20" +
      `stream%20to%20the%20${flowCouncilName}%20distribution%20pool%20on%20Flow%20` +
      "State.%0AJoin%20me%20in%20supporting%20these%20public%20goods%20builders" +
      `%20at%20${encodeURIComponent(flowCouncilUiLink)}`,
    farcaster:
      "https://farcaster.xyz/~/compose?text=I+just+opened+a+stream+to+" +
      `the+${flowCouncilName}+distribution+pool+on+Flow+State.%0AJoin+me+in+` +
      "supporting+these+public+goods+builders+at" +
      `&embeds[]=${encodeURIComponent(flowCouncilUiLink)}`,
    lens:
      `https://hey.xyz/?text=I+just+opened+a+stream+to+the+${flowCouncilName}+` +
      "distribution+pool+on+Flow+State.%0AJoin+me+in+supporting+these+public+" +
      `goods+builders+at+${encodeURIComponent(flowCouncilUiLink)}`,
  };
}
