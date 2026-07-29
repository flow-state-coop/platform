// Invisible characters that carry no meaning in human-facing text but do break
// exact-match lookups by API consumers: soft hyphen, zero-width space, word
// joiner, the byte-order mark, and the C0/C1 control blocks. ZWJ (U+200D) and ZWNJ (U+200C) are
// deliberately absent: both are load-bearing in Indic and Perso-Arabic scripts
// and in emoji sequences, so stripping them would corrupt legitimate values.
const INVISIBLE = /[\u00AD\u200B\u2060\uFEFF\p{Cc}]/gu;

// Whitespace controls, which stripInvisibleCharacters keeps so line structure
// survives.
const BREAKS = new Set(["\t", "\n", "\r"]);

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
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFC")
    .replace(INVISIBLE, (char) => (BREAKS.has(char) ? char : ""))
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
    .normalize("NFC")
    .replace(INVISIBLE, (char) => (BREAKS.has(char) ? char : ""))
    .trim();
}
