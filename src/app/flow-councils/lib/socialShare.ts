export type SocialAccount = {
  id: string;
  name: string;
  xHandle?: string;
  farcasterHandle?: string;
};

export type RoundSocialConfig = {
  accounts: SocialAccount[];
  voteMessage?: string;
  donationMessage?: string;
  shareImageUrl?: string;
};

type SharePlatform = "x" | "farcaster";

type ShareTextContext = {
  roundName: string;
  roundLink: string;
  accounts: SocialAccount[];
};

export const ROUND_NAME_TOKEN = "{round name}";
export const ROUND_LINK_TOKEN = "{round link}";
export const MENTION_TOKEN_REGEX = /@\[([^\]]+)\]/g;

export const X_CHAR_LIMIT = 280;
export const FARCASTER_CHAR_LIMIT = 320;
export const X_LINK_CHAR_COUNT = 23;

export const DEFAULT_VOTE_MESSAGE =
  "I just voted in {round name} on Flow State.\nJoin me in supporting these builders: {round link}";
export const DEFAULT_DONATION_MESSAGE =
  "I just opened a stream to the {round name} distribution pool on Flow State.\nJoin me in supporting these builders: {round link}";

function resolveMention(
  name: string,
  platform: SharePlatform,
  accounts: SocialAccount[],
): string {
  const trimmedName = name.trim();
  const account = accounts.find((a) => a.name.trim() === trimmedName);

  if (!account) {
    return name;
  }

  const handle = platform === "x" ? account.xHandle : account.farcasterHandle;

  return handle ? `@${handle}` : account.name;
}

export function resolveShareText(
  template: string,
  platform: SharePlatform,
  ctx: ShareTextContext,
): { text: string; hasRoundLink: boolean } {
  const hasRoundLink = template.includes(ROUND_LINK_TOKEN);
  const segments = template.split(ROUND_LINK_TOKEN).map((segment) =>
    segment
      .replace(MENTION_TOKEN_REGEX, (_, name) =>
        resolveMention(name, platform, ctx.accounts),
      )
      .split(ROUND_NAME_TOKEN)
      .join(ctx.roundName),
  );

  if (platform === "x") {
    return { text: segments.join(ctx.roundLink), hasRoundLink };
  }

  const text = hasRoundLink
    ? segments.join(" ").replace(/ {2,}/g, " ").trim()
    : segments[0];

  return { text, hasRoundLink };
}

export function getEffectiveCharCount(
  template: string,
  platform: SharePlatform,
  ctx: ShareTextContext,
): number {
  const countingCtx =
    platform === "x"
      ? { ...ctx, roundLink: "0".repeat(X_LINK_CHAR_COUNT) }
      : ctx;
  const { text } = resolveShareText(template, platform, countingCtx);

  return Array.from(text).length;
}

function buildShareLinks(
  template: string,
  councilName: string,
  councilUiLink: string,
  accounts: SocialAccount[],
): { twitter: string; farcaster: string } {
  const ctx = {
    roundName: councilName,
    roundLink: councilUiLink,
    accounts,
  };
  const x = resolveShareText(template, "x", ctx);
  const farcaster = resolveShareText(template, "farcaster", ctx);

  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(x.text)}`,
    farcaster:
      `https://farcaster.xyz/~/compose?text=${encodeURIComponent(farcaster.text)}` +
      (farcaster.hasRoundLink
        ? `&embeds[]=${encodeURIComponent(councilUiLink)}`
        : ""),
  };
}

export function getVoteSocialShare({
  councilName,
  councilUiLink,
  social,
}: {
  councilName: string;
  councilUiLink: string;
  social?: RoundSocialConfig;
}) {
  const template = social?.voteMessage?.trim()
    ? social.voteMessage
    : DEFAULT_VOTE_MESSAGE;

  return buildShareLinks(
    template,
    councilName,
    councilUiLink,
    social?.accounts ?? [],
  );
}

export function getSocialShare({
  councilName,
  councilUiLink,
  social,
}: {
  councilName: string;
  councilUiLink: string;
  social?: RoundSocialConfig;
}) {
  const template = social?.donationMessage?.trim()
    ? social.donationMessage
    : DEFAULT_DONATION_MESSAGE;

  return buildShareLinks(
    template,
    councilName,
    councilUiLink,
    social?.accounts ?? [],
  );
}
