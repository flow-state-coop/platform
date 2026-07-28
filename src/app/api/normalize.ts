type WeightedVote = { recipient: string; weight: number };
export type BallotVote = { recipient: `0x${string}`; amount: bigint };

// Fixed-point scale for turning fractional weights into integer shares. Each
// weight is scaled relative to the largest weight in the set (not their sum), so
// the heaviest entry maps to exactly 2^53 and the rest fall in [0, 2^53]. 2^53
// keeps the full float mantissa; the apportionment itself is exact BigInt math,
// so the only approximation is in the relative weights, not in the totals.
const WEIGHT_PRECISION = 2 ** 53;

/**
 * Convert relative per-recipient weights into an on-chain ballot, using
 * largest-remainder (Hamilton) apportionment in BigInt. `votingPower` and the
 * returned amounts are the FlowCouncil `uint96` vote type; the integer math is
 * exact across that whole range and the sum never exceeds `votingPower`, so
 * `vote()` cannot revert with NOT_ENOUGH_VOTING_POWER.
 *
 * Leftover units (those that remain after each share is floored) are handed to
 * the largest fractional remainders, but only where a remainder is strictly
 * larger than the others competing for the last unit. When recipients are tied
 * at that cutoff their claim is equal, so rather than breaking the tie by
 * address (which always favors the same recipient and surfaces as one grantee
 * getting an unearned extra vote), the ambiguous units are dropped. This keeps
 * clean ratios exact (a 3:1 split of 100 stays 75/25) while leaving an even
 * split untouched (25/25/25/101 rounds to 25/25/25/25, not 26/25/25/25), at the
 * cost of casting slightly fewer than `votingPower` votes in the even case.
 *
 * Zero/negative weights are dropped; when more recipients carry weight than
 * `maxVotingSpread` (0 = unlimited), only the top-weighted ones are kept.
 * Recipients that round to 0 votes are omitted. The result is sorted by
 * lowercased recipient address so it is deterministic and comparable.
 */
export function normalizeWeightsToVotingPower(
  votes: WeightedVote[],
  votingPower: bigint,
  maxVotingSpread: number,
): BallotVote[] {
  if (votingPower <= 0n) return [];

  const positive = votes.filter((v) => v.weight > 0);
  if (positive.length === 0) return [];

  // Rank by weight (tie-break: lower address) before applying the spread cap so
  // the kept set is deterministic.
  const ranked = [...positive].sort(
    (a, b) =>
      b.weight - a.weight ||
      a.recipient.toLowerCase().localeCompare(b.recipient.toLowerCase()),
  );
  const selected =
    maxVotingSpread > 0 ? ranked.slice(0, maxVotingSpread) : ranked;

  // Scale relative to the largest weight rather than the sum: summing arbitrary
  // finite weights can overflow to Infinity (e.g. several entries near 1e308),
  // which would zero every share and drop a perfectly valid ballot. Dividing by
  // the max keeps every ratio in [0, 1] and the heaviest entry at exactly 2^53,
  // so totalShare is always positive.
  const maxWeight = selected.reduce(
    (max, v) => (v.weight > max ? v.weight : max),
    0,
  );

  // Scale each fractional share to an integer; everything after this is exact.
  const entries = selected.map((v) => ({
    recipient: v.recipient,
    share: BigInt(Math.round((v.weight / maxWeight) * WEIGHT_PRECISION)),
    floor: 0n,
    remainder: 0n,
  }));

  const totalShare = entries.reduce((sum, e) => sum + e.share, 0n);
  if (totalShare === 0n) return [];

  for (const e of entries) {
    const ideal = e.share * votingPower;
    e.floor = ideal / totalShare;
    e.remainder = ideal % totalShare;
  }

  const allocated = entries.reduce((sum, e) => sum + e.floor, 0n);
  const leftover = votingPower - allocated;

  // Award a unit to every entry whose remainder is strictly greater than the
  // remainder at the cutoff (the first entry that wouldn't win a unit under a
  // greedy largest-remainder pass). Entries tied with the cutoff are ambiguous,
  // so their units are dropped instead of going to whichever sorts first. The
  // floor guarantees leftover < entries.length, so the cutoff index always
  // exists when leftover > 0. Mutates the shared entry objects.
  if (leftover > 0n) {
    const byRemainder = [...entries].sort((a, b) =>
      a.remainder < b.remainder ? 1 : a.remainder > b.remainder ? -1 : 0,
    );
    const cutoff = byRemainder[Number(leftover)].remainder;
    for (const e of byRemainder) {
      if (e.remainder > cutoff) e.floor += 1n;
    }
  }

  return entries
    .filter((e) => e.floor > 0n)
    .map((e) => ({
      recipient: e.recipient.toLowerCase() as `0x${string}`,
      amount: e.floor,
    }))
    .sort((a, b) => a.recipient.localeCompare(b.recipient));
}

/**
 * Order-independent equality of two ballots, keyed by lowercased recipient.
 * Used to skip an on-chain `vote()` when the computed ballot already matches the
 * voter's current on-chain ballot.
 */
export function votesEqual(a: BallotVote[], b: BallotVote[]): boolean {
  if (a.length !== b.length) return false;
  const byRecipient = new Map(
    a.map((v) => [v.recipient.toLowerCase(), v.amount]),
  );
  for (const v of b) {
    if (byRecipient.get(v.recipient.toLowerCase()) !== v.amount) return false;
  }
  return true;
}
