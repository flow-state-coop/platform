// Pure vote/group math for the Voter Groups feature.
// All functions are deterministic and side-effect free so they can be unit
// tested in isolation (see voterUtils.test.ts) and reused across the overview
// table, group detail page, voter table, and bulk-action toolbar.

import { isAddress } from "viem";

/**
 * Accept a wallet address the voter flows can safely lowercase and store: it
 * must be a structurally valid hex address, and when it carries EIP-55 checksum
 * casing (mixed case) that checksum must be correct. All-lowercase or
 * all-uppercase input has no checksum to verify, so it's accepted as an
 * intentionally non-checksummed address; a mixed-case string that fails the
 * checksum is almost always a mistyped character and is rejected rather than
 * silently mapped to the wrong address.
 */
export function isVoterAddress(value: string): boolean {
  if (!isAddress(value, { strict: false })) {
    return false;
  }

  const body = value.slice(2);
  const isChecksummed =
    body !== body.toLowerCase() && body !== body.toUpperCase();

  return isChecksummed ? isAddress(value, { strict: true }) : true;
}

/**
 * Sum the votes a voter has already cast on their ballot.
 * The subgraph returns amounts as decimal strings; returns 0 when the voter has
 * no ballot or an empty votes array.
 */
export function computeCastVotes(voter: {
  ballot?: { votes?: { amount: string }[] };
}): number {
  const votes = voter.ballot?.votes;

  if (!votes || votes.length === 0) {
    return 0;
  }

  return votes.reduce((sum, vote) => sum + Number(vote.amount), 0);
}

/**
 * Compute the new voting power for a bulk action.
 * "set" replaces the existing power with `value`; "increment" adds `value` to
 * the existing power.
 */
export function computeNewVotingPower(
  existingPower: number,
  value: number,
  mode: "set" | "increment",
): number {
  return mode === "set" ? value : existingPower + value;
}

/**
 * True when applying `newPower` would drop a voter's allocation strictly below
 * the number of votes they've already cast (mid-round warning condition).
 */
export function wouldReduceBelowCast(
  newPower: number,
  castVotes: number,
): boolean {
  return newPower < castVotes;
}

/**
 * Percentage of a voter's allocation that has already been cast.
 * Returns 0 when the allocation is 0 to avoid divide-by-zero. Not capped at
 * 100 — cast exceeding allocation yields a value > 100 by design.
 */
export function pctCast(castVotes: number, allocation: number): number {
  if (allocation === 0) {
    return 0;
  }

  return (castVotes / allocation) * 100;
}

/**
 * Strict greater-than filter on % of allocation cast (e.g. "> 80%").
 * A voter whose pctCast exactly equals the threshold does NOT pass.
 */
export function passesPctFilter(
  castVotes: number,
  allocation: number,
  threshold: number,
): boolean {
  return pctCast(castVotes, allocation) > threshold;
}

/**
 * A group's share (%) of total outstanding council votes.
 * Returns 0 when the council has no outstanding votes (divide-by-zero guard).
 */
export function shareOfVotes(
  groupAssignedVotes: number,
  totalCouncilVotes: number,
): number {
  if (totalCouncilVotes === 0) {
    return 0;
  }

  return (groupAssignedVotes / totalCouncilVotes) * 100;
}

/**
 * Number of pages for a paginated list. Math.ceil of count / pageSize, with a
 * floor of 1 so an empty list still renders a single (empty) page.
 */
export function totalPages(filteredCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(filteredCount / pageSize));
}

/**
 * A valid vote allocation: a positive integer in [1, 1,000,000]. 0 is not an
 * edit — removal is how a voter is zeroed — so the value stays meaningful as an
 * allocation.
 */
export function isValidVotes(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1e6;
}

/**
 * Validate a user-entered vote power (the metrics bot's allocation) or default
 * vote allocation (GoodDollar), returning an error message or null. Shared by
 * the group create and edit flows so their bounds and wording can't drift apart;
 * `isMetrics` only tunes the wording.
 */
export function validateVotePowerInput(
  value: string,
  isMetrics: boolean,
): string | null {
  if (isValidVotes(value)) return null;

  return isMetrics
    ? "Vote power must be an integer between 1 and 1M"
    : "Default votes must be an integer between 1 and 1M";
}
