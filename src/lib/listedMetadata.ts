/**
 * Helpers for the round "listed" discovery flag.
 *
 * The flag is stored inside a round's existing metadata blob as a JSON object,
 * e.g. `{"listed":true}` — in Postgres `rounds.details` for Flow Councils and in
 * the on-chain `metadata` string for Flow Splitters. A round is "listed" ONLY
 * when that object's `listed` value is the boolean `true`; everything else
 * (empty/undefined, legacy free-form text, malformed JSON, a missing key, or a
 * non-boolean value) reads as unlisted. This is the spec's
 * "missing/non-true = unlisted" contract.
 */
export function parseListed(metadata: string | null | undefined): boolean {
  if (!metadata) return false;
  try {
    const parsed = JSON.parse(metadata);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      parsed.listed === true
    );
  } catch {
    return false;
  }
}

/**
 * Serializes the "listed" flag into the canonical metadata string, exactly
 * `{"listed":true}` or `{"listed":false}` with no whitespace, so a future
 * subgraph `metadata_contains: '"listed":true'` substring filter matches
 * reliably. Keep this object to the single `listed` key — adding more keys
 * would make substring matching order-sensitive.
 */
export function serializeListed(listed: boolean): string {
  return JSON.stringify({ listed });
}
