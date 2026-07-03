import { describe, it, expect } from "vitest";
import {
  resolveShareText,
  getEffectiveCharCount,
  getVoteSocialShare,
  getSocialShare,
  DEFAULT_VOTE_MESSAGE,
  DEFAULT_DONATION_MESSAGE,
  X_CHAR_LIMIT,
  FARCASTER_CHAR_LIMIT,
  X_LINK_CHAR_COUNT,
  type SocialAccount,
  type RoundSocialConfig,
} from "./socialShare";

// Spec (.claude/specs/social-share-tab.md):
// - "@mentions … a plain-text token (e.g. @[Octant]) … resolves to the right
//   handle per platform when the post is drafted"
// - "On X the link is in the text; on Farcaster the link is attached as an
//   embed so it renders as a card."
// - "X counting the link as a fixed ~23 characters, Farcaster excluding the
//   link since it travels as an embedded card" (X: 280; Farcaster: 320)
// - "No configuration saved → current default messages … are used; existing
//   rounds are unaffected."
// - "Message cleared to empty → treated as unconfigured; that action falls
//   back to the default message."
// - "Account missing one platform's handle → the mention falls back to the
//   account's display name as plain text on that platform"
// - "{round name} used while the round has no name → resolves to an empty string"
// - "{round link} token deleted by the admin → allowed … the post won't link
//   back to the round and won't show the image card"
// - Success criterion 6: '"Post on Lens" no longer appears anywhere.'

const ROUND_NAME = "GoodBuilders";
const ROUND_LINK =
  "https://flowstate.network/flow-councils/10/0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const octant: SocialAccount = {
  id: "acc-octant",
  name: "Octant",
  xHandle: "octantapp",
  farcasterHandle: "octant",
};

const farcasterOnly: SocialAccount = {
  id: "acc-fc-only",
  name: "Fartown",
  farcasterHandle: "fartown",
};

const emptyXHandle: SocialAccount = {
  id: "acc-empty-x",
  name: "Blanks",
  xHandle: "",
  farcasterHandle: "blanks",
};

const baseCtx = {
  roundName: ROUND_NAME,
  roundLink: ROUND_LINK,
  accounts: [octant, farcasterOnly, emptyXHandle],
};

// Today's production messages, decoded from the current socialShare.ts URLs.
// These are the contract for the "no configuration" path (success criterion 2).
const EXPECTED_VOTE_X_TEXT = `I just voted in ${ROUND_NAME} on Flow State.\nJoin me in supporting these builders: ${ROUND_LINK}`;
const EXPECTED_VOTE_FARCASTER_TEXT = `I just voted in ${ROUND_NAME} on Flow State.\nJoin me in supporting these builders:`;
const EXPECTED_DONATION_X_TEXT = `I just opened a stream to the ${ROUND_NAME} distribution pool on Flow State.\nJoin me in supporting these builders: ${ROUND_LINK}`;
const EXPECTED_DONATION_FARCASTER_TEXT = `I just opened a stream to the ${ROUND_NAME} distribution pool on Flow State.\nJoin me in supporting these builders:`;

function textParam(url: string): string {
  return new URL(url).searchParams.get("text") ?? "";
}

function embedsParams(url: string): string[] {
  return new URL(url).searchParams.getAll("embeds[]");
}

// ---------------------------------------------------------------------------
// Platform constants
// ---------------------------------------------------------------------------

describe("platform constants", () => {
  it("X_CHAR_LIMIT is 280 (X web intent limit)", () => {
    expect(X_CHAR_LIMIT).toBe(280);
  });

  it("FARCASTER_CHAR_LIMIT is 320 (standard cast, renders in all clients)", () => {
    expect(FARCASTER_CHAR_LIMIT).toBe(320);
  });

  it("X_LINK_CHAR_COUNT is 23 (t.co wrapped link length)", () => {
    expect(X_LINK_CHAR_COUNT).toBe(23);
  });
});

// ---------------------------------------------------------------------------
// Default templates
// ---------------------------------------------------------------------------

// Spec: "Editors are pre-filled with today's default messages" — the exported
// defaults must be today's production wording with tokens in place of the
// interpolated values.

describe("default message templates", () => {
  it("DEFAULT_VOTE_MESSAGE is today's production vote wording as a template", () => {
    expect(DEFAULT_VOTE_MESSAGE).toBe(
      "I just voted in {round name} on Flow State.\nJoin me in supporting these builders: {round link}",
    );
  });

  it("DEFAULT_DONATION_MESSAGE is today's production donation wording as a template", () => {
    expect(DEFAULT_DONATION_MESSAGE).toBe(
      "I just opened a stream to the {round name} distribution pool on Flow State.\nJoin me in supporting these builders: {round link}",
    );
  });
});

// ---------------------------------------------------------------------------
// resolveShareText
// ---------------------------------------------------------------------------

describe("resolveShareText", () => {
  describe("@[Name] mention resolution", () => {
    it("resolves a mention to the X handle on x", () => {
      const result = resolveShareText("Vote for @[Octant] now", "x", baseCtx);
      expect(result.text).toBe("Vote for @octantapp now");
    });

    it("resolves a mention to the Farcaster handle on farcaster", () => {
      const result = resolveShareText(
        "Vote for @[Octant] now",
        "farcaster",
        baseCtx,
      );
      expect(result.text).toBe("Vote for @octant now");
    });

    it("falls back to the plain account name (no @) on X when the account has no X handle", () => {
      const result = resolveShareText("Thanks @[Fartown]!", "x", baseCtx);
      expect(result.text).toBe("Thanks Fartown!");
    });

    it("still mentions the Farcaster handle of an X-less account on farcaster", () => {
      const result = resolveShareText(
        "Thanks @[Fartown]!",
        "farcaster",
        baseCtx,
      );
      expect(result.text).toBe("Thanks @fartown!");
    });

    it("treats an empty-string handle as missing (plain name, never a bare @)", () => {
      const result = resolveShareText("Hey @[Blanks]", "x", baseCtx);
      expect(result.text).toBe("Hey Blanks");
    });

    it("renders an unknown mention token's inner text as plain text", () => {
      expect(resolveShareText("cc @[Nobody]", "x", baseCtx).text).toBe(
        "cc Nobody",
      );
      expect(resolveShareText("cc @[Nobody]", "farcaster", baseCtx).text).toBe(
        "cc Nobody",
      );
    });

    it("resolves multiple mentions in one template", () => {
      const result = resolveShareText(
        "By @[Octant] and @[Fartown]",
        "x",
        baseCtx,
      );
      expect(result.text).toBe("By @octantapp and Fartown");
    });
  });

  describe("{round name} token", () => {
    it("resolves {round name} to ctx.roundName", () => {
      const result = resolveShareText(
        "Vote in '{round name}' now",
        "x",
        baseCtx,
      );
      expect(result.text).toBe("Vote in 'GoodBuilders' now");
    });

    it("resolves {round name} to an empty string when the round has no name", () => {
      const result = resolveShareText("Vote in '{round name}' now", "x", {
        ...baseCtx,
        roundName: "",
      });
      expect(result.text).toBe("Vote in '' now");
    });
  });

  describe("{round link} token", () => {
    it("inlines the round link in the text on X and reports hasRoundLink", () => {
      const result = resolveShareText("Check {round link} out", "x", baseCtx);
      expect(result.text).toBe(`Check ${ROUND_LINK} out`);
      expect(result.hasRoundLink).toBe(true);
    });

    it("strips the link from the text on Farcaster, collapsing the leftover whitespace", () => {
      const result = resolveShareText(
        "Check {round link} out",
        "farcaster",
        baseCtx,
      );
      expect(result.text).toBe("Check out");
      expect(result.hasRoundLink).toBe(true);
    });

    it("produces no trailing whitespace when the link ends the template on Farcaster", () => {
      const result = resolveShareText(
        DEFAULT_VOTE_MESSAGE,
        "farcaster",
        baseCtx,
      );
      expect(result.text).toBe(EXPECTED_VOTE_FARCASTER_TEXT);
      expect(result.hasRoundLink).toBe(true);
    });

    it("reports hasRoundLink=false on both platforms when the template has no link token", () => {
      expect(resolveShareText("Just vibes", "x", baseCtx)).toMatchObject({
        text: "Just vibes",
        hasRoundLink: false,
      });
      expect(
        resolveShareText("Just vibes", "farcaster", baseCtx),
      ).toMatchObject({ text: "Just vibes", hasRoundLink: false });
    });
  });
});

// ---------------------------------------------------------------------------
// getEffectiveCharCount
// ---------------------------------------------------------------------------

// Spec: "Live character feedback shows the effective length per platform
// (mentions resolved …, X counting the link as a fixed ~23 characters,
// Farcaster excluding the link since it travels as an embedded card)."

describe("getEffectiveCharCount", () => {
  it("counts {round link} as exactly 23 on X regardless of the actual link length", () => {
    const shortLinkCtx = { ...baseCtx, roundLink: "https://a.b" };
    const longLinkCtx = {
      ...baseCtx,
      roundLink: "https://example.com/" + "a".repeat(200),
    };
    expect(getEffectiveCharCount("{round link}", "x", shortLinkCtx)).toBe(23);
    expect(getEffectiveCharCount("{round link}", "x", longLinkCtx)).toBe(23);
  });

  it("counts {round link} as 0 on Farcaster regardless of the actual link length", () => {
    const longLinkCtx = {
      ...baseCtx,
      roundLink: "https://example.com/" + "a".repeat(200),
    };
    expect(
      getEffectiveCharCount("{round link}", "farcaster", longLinkCtx),
    ).toBe(0);
  });

  it("adds 23 for the link to the surrounding text on X", () => {
    // "Check " = 6 chars + link as 23
    expect(getEffectiveCharCount("Check {round link}", "x", baseCtx)).toBe(29);
  });

  it("excludes the link and its cleaned-up whitespace on Farcaster", () => {
    // Resolved Farcaster text is "Check" (5 chars)
    expect(
      getEffectiveCharCount("Check {round link}", "farcaster", baseCtx),
    ).toBe(5);
    // "a {round link} b" resolves to "a b" (3 chars) on Farcaster,
    // "a <link> b" = 2 + 23 + 2 on X
    expect(
      getEffectiveCharCount("a {round link} b", "farcaster", baseCtx),
    ).toBe(3);
    expect(getEffectiveCharCount("a {round link} b", "x", baseCtx)).toBe(27);
  });

  it("counts emoji per Unicode code point, not per UTF-16 unit", () => {
    // "🔥".length is 2; the counter must count it as 1
    expect(getEffectiveCharCount("🔥🔥🔥", "x", baseCtx)).toBe(3);
    expect(getEffectiveCharCount("🔥🔥🔥", "farcaster", baseCtx)).toBe(3);
  });

  it("counts mentions at the resolved handle length per platform", () => {
    // "@octantapp" = 10 chars on X, "@octant" = 7 on Farcaster
    expect(getEffectiveCharCount("@[Octant]", "x", baseCtx)).toBe(10);
    expect(getEffectiveCharCount("@[Octant]", "farcaster", baseCtx)).toBe(7);
  });

  it("counts a missing-handle mention at the plain name length", () => {
    // "Fartown" = 7 chars on X (no X handle)
    expect(getEffectiveCharCount("@[Fartown]", "x", baseCtx)).toBe(7);
  });

  it("counts {round name} at the round name's resolved length", () => {
    // "GoodBuilders" = 12 chars
    expect(getEffectiveCharCount("{round name}", "x", baseCtx)).toBe(12);
    expect(
      getEffectiveCharCount("{round name}", "x", { ...baseCtx, roundName: "" }),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getVoteSocialShare
// ---------------------------------------------------------------------------

describe("getVoteSocialShare", () => {
  describe("no social config (defaults — success criterion 2)", () => {
    const result = getVoteSocialShare({
      councilName: ROUND_NAME,
      councilUiLink: ROUND_LINK,
    });

    it("builds exactly today's production X intent URL", () => {
      expect(result.twitter).toBe(
        "https://twitter.com/intent/tweet?text=" +
          encodeURIComponent(EXPECTED_VOTE_X_TEXT),
      );
    });

    it("builds exactly today's production Farcaster compose URL with the link as an embed", () => {
      expect(result.farcaster).toBe(
        "https://farcaster.xyz/~/compose?text=" +
          encodeURIComponent(EXPECTED_VOTE_FARCASTER_TEXT) +
          `&embeds[]=${encodeURIComponent(ROUND_LINK)}`,
      );
    });

    it("decodes to today's production vote messages", () => {
      expect(textParam(result.twitter)).toBe(EXPECTED_VOTE_X_TEXT);
      expect(textParam(result.farcaster)).toBe(EXPECTED_VOTE_FARCASTER_TEXT);
      expect(embedsParams(result.farcaster)).toEqual([ROUND_LINK]);
    });

    it("returns only twitter and farcaster keys (no lens)", () => {
      expect(Object.keys(result).sort()).toEqual(["farcaster", "twitter"]);
      expect(result).not.toHaveProperty("lens");
    });
  });

  describe("configured template", () => {
    const social: RoundSocialConfig = {
      accounts: [octant, farcasterOnly],
      voteMessage: "Voted for @[Octant] in {round name}! {round link}",
    };

    it("resolves mentions, round name, and link per platform in the intent URLs", () => {
      const result = getVoteSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social,
      });
      expect(textParam(result.twitter)).toBe(
        `Voted for @octantapp in ${ROUND_NAME}! ${ROUND_LINK}`,
      );
      expect(textParam(result.farcaster)).toBe(
        `Voted for @octant in ${ROUND_NAME}!`,
      );
      expect(embedsParams(result.farcaster)).toEqual([ROUND_LINK]);
    });

    it("omits the Farcaster embeds[] param when the template has no {round link}", () => {
      const result = getVoteSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: { accounts: [octant], voteMessage: "No link here @[Octant]" },
      });
      expect(new URL(result.farcaster).searchParams.has("embeds[]")).toBe(
        false,
      );
      expect(textParam(result.twitter)).toBe("No link here @octantapp");
      expect(textParam(result.twitter)).not.toContain(ROUND_LINK);
    });

    it("uses voteMessage, not donationMessage", () => {
      const result = getVoteSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: {
          accounts: [],
          voteMessage: "vote msg {round link}",
          donationMessage: "donation msg {round link}",
        },
      });
      expect(textParam(result.twitter)).toBe(`vote msg ${ROUND_LINK}`);
    });
  });

  describe("empty template falls back to the default message", () => {
    const defaults = getVoteSocialShare({
      councilName: ROUND_NAME,
      councilUiLink: ROUND_LINK,
    });

    it("treats an empty-string voteMessage as unconfigured", () => {
      const result = getVoteSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: { accounts: [], voteMessage: "" },
      });
      expect(result).toEqual(defaults);
    });

    it("treats a whitespace-only voteMessage as unconfigured", () => {
      const result = getVoteSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: { accounts: [], voteMessage: "   \n  " },
      });
      expect(result).toEqual(defaults);
    });

    it("uses the default message when social config exists but voteMessage is absent", () => {
      const result = getVoteSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: { accounts: [octant] },
      });
      expect(result).toEqual(defaults);
    });
  });
});

// ---------------------------------------------------------------------------
// getSocialShare (donation)
// ---------------------------------------------------------------------------

describe("getSocialShare", () => {
  describe("no social config (defaults — success criterion 2)", () => {
    const result = getSocialShare({
      councilName: ROUND_NAME,
      councilUiLink: ROUND_LINK,
    });

    it("builds exactly today's production X intent URL", () => {
      expect(result.twitter).toBe(
        "https://twitter.com/intent/tweet?text=" +
          encodeURIComponent(EXPECTED_DONATION_X_TEXT),
      );
    });

    it("builds exactly today's production Farcaster compose URL with the link as an embed", () => {
      expect(result.farcaster).toBe(
        "https://farcaster.xyz/~/compose?text=" +
          encodeURIComponent(EXPECTED_DONATION_FARCASTER_TEXT) +
          `&embeds[]=${encodeURIComponent(ROUND_LINK)}`,
      );
    });

    it("decodes to today's production donation messages", () => {
      expect(textParam(result.twitter)).toBe(EXPECTED_DONATION_X_TEXT);
      expect(textParam(result.farcaster)).toBe(
        EXPECTED_DONATION_FARCASTER_TEXT,
      );
      expect(embedsParams(result.farcaster)).toEqual([ROUND_LINK]);
    });

    it("returns only twitter and farcaster keys (no lens)", () => {
      expect(Object.keys(result).sort()).toEqual(["farcaster", "twitter"]);
      expect(result).not.toHaveProperty("lens");
    });
  });

  describe("configured template", () => {
    it("uses donationMessage, not voteMessage", () => {
      const result = getSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: {
          accounts: [],
          voteMessage: "vote msg {round link}",
          donationMessage: "donation msg {round link}",
        },
      });
      expect(textParam(result.twitter)).toBe(`donation msg ${ROUND_LINK}`);
    });

    it("resolves mentions per platform in the donation message", () => {
      const result = getSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: {
          accounts: [octant],
          donationMessage: "Streaming with @[Octant] {round link}",
        },
      });
      expect(textParam(result.twitter)).toBe(
        `Streaming with @octantapp ${ROUND_LINK}`,
      );
      expect(textParam(result.farcaster)).toBe("Streaming with @octant");
      expect(embedsParams(result.farcaster)).toEqual([ROUND_LINK]);
    });

    it("treats an empty donationMessage as unconfigured", () => {
      const defaults = getSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
      });
      const result = getSocialShare({
        councilName: ROUND_NAME,
        councilUiLink: ROUND_LINK,
        social: { accounts: [], donationMessage: "" },
      });
      expect(result).toEqual(defaults);
    });
  });
});
