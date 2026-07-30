// Invisible characters that carry no meaning in human-facing text but do break
// exact-match lookups by API consumers: soft hyphen, zero-width space, word
// joiner, the byte-order mark, the C0/C1 control blocks, and the bidi
// embedding/override/isolate controls. Three sets are deliberately absent: ZWJ
// (U+200D) and ZWNJ (U+200C), load-bearing in Indic and Perso-Arabic scripts and
// in emoji sequences; and LRM/RLM (U+200E/U+200F), which legitimately fix
// punctuation direction in a mixed-direction name. The bidi controls above are
// paired scoping markers with no such single-character use in a name.
const INVISIBLE =
  /[\u00AD\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069\p{Cc}]/gu;

// Whitespace controls, which the strip keeps so they can fold into separators
// or preserve line structure rather than joining the words around them.
const BREAKS = new Set(["\t", "\n", "\v", "\f", "\r"]);

/**
 * Canonical form of a single-line name: a project, round, voter group, person,
 * or social account. Applied on write so stored names are directly comparable,
 * and on read at the API boundary so rows written before this existed don't
 * surface as silent mismatches.
 *
 * Zero-width characters are dropped before whitespace is folded, so an
 * embedded one joins the surrounding text rather than becoming a space. Tabs
 * and newlines survive that pass and then fold into separators, so a name ends
 * up as one line with single spacing.
 *
 * NFC runs after the strip, not before: an invisible sitting between a base
 * letter and its combining mark blocks composition, so normalizing first would
 * leave a decomposed sequence behind once the blocker is gone.
 */
export function normalizeName(value: string): string {
  return value
    .replace(INVISIBLE, (char) => (BREAKS.has(char) ? char : ""))
    .normalize("NFC")
    .replace(/\s/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * The subset of the above that is safe for free-form text: Unicode-normalize,
 * drop invisible characters, trim the ends. Internal line structure survives,
 * because production holds milestone titles that people pasted whole markdown
 * paragraphs into, and collapsing those would rewrite their content.
 */
export function stripInvisibleCharacters(value: string): string {
  return value
    .replace(INVISIBLE, (char) => (BREAKS.has(char) ? char : ""))
    .normalize("NFC")
    .trim();
}
