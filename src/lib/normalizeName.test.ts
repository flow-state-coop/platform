import { describe, it, expect } from "vitest";
import { normalizeName, stripInvisibleCharacters } from "./normalizeName";

const NBSP = "\u00A0";
const EN_SPACE = "\u2002";
const IDEOGRAPHIC_SPACE = "\u3000";
const BOM = "\uFEFF";
const ZWSP = "\u200B";
const SOFT_HYPHEN = "\u00AD";
const WORD_JOINER = "\u2060";
const ZWJ = "\u200D";
const ZWNJ = "\u200C";
const RLM = "\u200F";
const RLO = "\u202E";
const FSI = "\u2068";
const COMBINING_ACUTE = "\u0301";

describe("normalizeName", () => {
  it("leaves a clean name untouched", () => {
    expect(normalizeName("Blockslide")).toBe("Blockslide");
    expect(normalizeName("Pesia's Kitchen")).toBe("Pesia's Kitchen");
  });

  it("strips surrounding whitespace of any length", () => {
    expect(normalizeName("Blockslide ")).toBe("Blockslide");
    expect(normalizeName("   Blockslide   ")).toBe("Blockslide");
  });

  it("folds tabs and newlines into separators rather than deleting them", () => {
    expect(normalizeName("\tBlockslide\n")).toBe("Blockslide");
    expect(normalizeName("Block\tslide")).toBe("Block slide");
    expect(normalizeName("Block\nslide")).toBe("Block slide");
  });

  it("collapses internal whitespace runs", () => {
    expect(normalizeName("Block   slide")).toBe("Block slide");
    expect(normalizeName("A  B   C")).toBe("A B C");
  });

  it("converts non-breaking and exotic spaces to plain spaces", () => {
    expect(normalizeName(`Block${NBSP}slide`)).toBe("Block slide");
    expect(normalizeName(`Block${EN_SPACE}slide`)).toBe("Block slide");
    expect(normalizeName(`Block${IDEOGRAPHIC_SPACE}slide`)).toBe("Block slide");
    expect(normalizeName(`${BOM}Blockslide`)).toBe("Blockslide");
    expect(normalizeName(`Block${BOM}slide`)).toBe("Blockslide");
  });

  it("removes invisible characters that survive a plain trim", () => {
    expect(normalizeName(`Blockslide${ZWSP}`)).toBe("Blockslide");
    expect(normalizeName(`${ZWSP}Blockslide${ZWSP}`)).toBe("Blockslide");
    expect(normalizeName(`Block${SOFT_HYPHEN}slide`)).toBe("Blockslide");
    expect(normalizeName(`Blockslide${WORD_JOINER}`)).toBe("Blockslide");
  });

  it("does not leave a double space behind after stripping an invisible", () => {
    expect(normalizeName(`Block ${ZWSP} slide`)).toBe("Block slide");
  });

  it("removes control characters", () => {
    expect(normalizeName("Block\u0001slide")).toBe("Blockslide");
    expect(normalizeName("Blockslide\u0000")).toBe("Blockslide");
  });

  it("folds every whitespace control into a separator", () => {
    for (const control of ["\t", "\n", "\v", "\f", "\r"]) {
      expect(normalizeName(`Block${control}slide`)).toBe("Block slide");
    }
  });

  it("removes bidi overrides and isolates but keeps the marks", () => {
    expect(normalizeName(`Block${RLO}slide`)).toBe("Blockslide");
    expect(normalizeName(`Block${FSI}slide`)).toBe("Blockslide");
    expect(normalizeName(`Blockslide${RLM}`)).toBe(`Blockslide${RLM}`);
  });

  it("unicode-normalizes so identical-looking names compare equal", () => {
    const composed: string = "Caf\u00E9";
    const decomposed: string = "Cafe\u0301";
    expect(composed === decomposed).toBe(false);
    expect(normalizeName(decomposed)).toBe(composed);
    expect(normalizeName(decomposed)).toBe(normalizeName(composed));
  });

  it("composes across a stripped invisible instead of leaving it decomposed", () => {
    const blocked = `Cafe${ZWSP}${COMBINING_ACUTE}`;
    const normalized = normalizeName(blocked);
    expect(normalized).toBe("Caf\u00E9");
    expect(normalized).toBe(normalized.normalize("NFC"));
    expect(normalizeName(normalized)).toBe(normalized);
  });

  it("preserves ZWJ and ZWNJ, meaningful in emoji and Perso-Arabic script", () => {
    const family = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}`;
    expect(normalizeName(`${family} Project`)).toBe(`${family} Project`);
    const persian = `\u0645\u06CC${ZWNJ}\u062E\u0648\u0627\u0646\u0645`;
    expect(normalizeName(persian)).toBe(persian);
  });

  it("reduces a name of only whitespace or invisibles to an empty string", () => {
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(`${ZWSP}${WORD_JOINER}`)).toBe("");
  });

  it("is idempotent", () => {
    const messy = `  Block ${ZWSP}  slide${SOFT_HYPHEN} \n`;
    const once = normalizeName(messy);
    expect(normalizeName(once)).toBe(once);
  });
});

describe("stripInvisibleCharacters", () => {
  it("preserves internal line structure", () => {
    const markdown = "## Heading\n\nA paragraph.";
    expect(stripInvisibleCharacters(markdown)).toBe(markdown);
  });

  it("still trims the ends", () => {
    expect(stripInvisibleCharacters("  Launch of MVP  ")).toBe("Launch of MVP");
    expect(stripInvisibleCharacters("\n Title \n")).toBe("Title");
  });

  it("still removes invisible characters", () => {
    expect(stripInvisibleCharacters(`Title${ZWSP}`)).toBe("Title");
    expect(stripInvisibleCharacters(`Ti${SOFT_HYPHEN}tle`)).toBe("Title");
  });

  it("removes a byte-order mark embedded mid-text, not just at the edges", () => {
    expect(stripInvisibleCharacters(`Ti${BOM}tle`)).toBe("Title");
    expect(stripInvisibleCharacters(`${BOM}Title${BOM}`)).toBe("Title");
  });

  it("removes non-whitespace control characters but keeps tabs and newlines", () => {
    expect(stripInvisibleCharacters("a\u0000b")).toBe("ab");
    expect(stripInvisibleCharacters("a\tb\nc")).toBe("a\tb\nc");
  });

  it("unicode-normalizes", () => {
    expect(stripInvisibleCharacters("Cafe\u0301")).toBe("Caf\u00E9");
  });

  it("composes across a stripped invisible instead of leaving it decomposed", () => {
    const normalized = stripInvisibleCharacters(
      `Cafe${ZWSP}${COMBINING_ACUTE}`,
    );
    expect(normalized).toBe("Caf\u00E9");
    expect(normalized).toBe(normalized.normalize("NFC"));
  });

  it("is idempotent", () => {
    const once = stripInvisibleCharacters(`  A${ZWSP}\n\nB  `);
    expect(stripInvisibleCharacters(once)).toBe(once);
  });
});
