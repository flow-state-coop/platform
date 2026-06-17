type WeightedVote = { recipient: string; weight: number };
export type BallotVote = { recipient: `0x${string}`; amount: bigint };

/**
 * Convert relative per-recipient weights into an on-chain ballot whose integer
 * amounts sum to exactly `votingPower`, using largest-remainder (Hamilton)
 * apportionment. Zero/negative weights are dropped; when more recipients carry
 * weight than `maxVotingSpread` (0 = unlimited), only the top-weighted ones are
 * kept. Recipients that round to 0 votes are omitted. The result is sorted by
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

  const totalWeight = selected.reduce((sum, v) => sum + v.weight, 0);
  const power = Number(votingPower);

  const entries = selected.map((v) => {
    const ideal = (v.weight / totalWeight) * power;
    const floor = Math.floor(ideal);
    return {
      recipient: v.recipient,
      floor,
      remainder: ideal - floor,
      weight: v.weight,
    };
  });

  const allocated = entries.reduce((sum, e) => sum + e.floor, 0);
  let leftover = power - allocated;

  // Hand the leftover units to the largest fractional remainders (tie-break:
  // larger weight, then lower address). Mutates the shared entry objects.
  const byRemainder = [...entries].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.weight - a.weight ||
      a.recipient.toLowerCase().localeCompare(b.recipient.toLowerCase()),
  );
  for (let i = 0; i < byRemainder.length && leftover > 0; i++) {
    byRemainder[i].floor += 1;
    leftover -= 1;
  }

  return entries
    .filter((e) => e.floor > 0)
    .map((e) => ({
      recipient: e.recipient.toLowerCase() as `0x${string}`,
      amount: BigInt(e.floor),
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
