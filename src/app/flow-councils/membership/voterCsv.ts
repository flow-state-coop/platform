// Pure CSV import/export logic for the group voter table. Kept side-effect free
// (no React, no DOM) so the roster-sync math can be unit tested in isolation;
// VoterTable owns the Papa.parse / Blob plumbing around these.

import { isAddress } from "viem";
import { isValidVotes } from "@/app/flow-councils/lib/voterUtils";
import type { NewRow, SubgraphVoter } from "./voterTableTypes";

export type CsvSyncResult = {
  // acct(lowercase) -> new votes string, only for existing members whose
  // allocation changed.
  nextEdited: Record<string, string>;
  // Existing members absent from the file, staged for removal.
  nextRemoved: Set<string>;
  // File addresses not already in this group / onchain, staged as new rows
  // (without ids — the caller assigns them).
  nextNew: { address: string; votes: string }[];
  // Rows ignored: invalid addresses, plus file addresses already onchain in
  // another group.
  skipped: number;
};

/**
 * Sync a group's roster to an uploaded CSV's rows: rows in the file are
 * added/updated, existing members absent from the file are staged for removal.
 * Each row is `[address, votingPower]`; a missing/invalid votingPower falls back
 * to `defaultVotingPower`.
 */
export function computeCsvSync(
  rows: string[][],
  voters: SubgraphVoter[],
  existingOnchain: Set<string>,
  defaultVotingPower: number,
): CsvSyncResult {
  const desired = new Map<string, string>();
  let skipped = 0;

  for (const row of rows) {
    const address = (row[0] ?? "").trim();

    if (address === "") {
      continue;
    }

    if (!isAddress(address, { strict: false })) {
      skipped++;
      continue;
    }

    desired.set(address.toLowerCase(), (row[1] ?? "").trim());
  }

  const groupAccts = new Set(voters.map((v) => v.account.toLowerCase()));
  const nextEdited: Record<string, string> = {};
  const nextRemoved = new Set<string>();
  const nextNew: { address: string; votes: string }[] = [];

  // Existing members: update to the file's votes, or remove if absent.
  for (const voter of voters) {
    const acct = voter.account.toLowerCase();

    if (desired.has(acct)) {
      const raw = desired.get(acct)!;
      const votes = isValidVotes(raw) ? raw : String(defaultVotingPower);

      if (Number(votes) !== Number(voter.votingPower)) {
        nextEdited[acct] = votes;
      }
    } else {
      nextRemoved.add(acct);
    }
  }

  // File addresses not in this group and not already onchain → add.
  for (const [acct, raw] of desired) {
    if (groupAccts.has(acct) || existingOnchain.has(acct)) {
      if (!groupAccts.has(acct)) {
        skipped++;
      }
      continue;
    }

    nextNew.push({
      address: acct,
      votes: isValidVotes(raw) ? raw : String(defaultVotingPower),
    });
  }

  return { nextEdited, nextRemoved, nextNew, skipped };
}

/**
 * Build the `[address, votingPower]` rows for a CSV export: current members
 * (minus those staged for removal, at their shown votes) plus the staged new
 * rows.
 */
export function buildCsvRows(
  voters: SubgraphVoter[],
  removed: Set<string>,
  shownVotes: (voter: SubgraphVoter) => string,
  validNewRows: NewRow[],
): string[][] {
  const rows: string[][] = [];

  for (const voter of voters) {
    if (removed.has(voter.account.toLowerCase())) {
      continue;
    }

    rows.push([voter.account, shownVotes(voter)]);
  }

  for (const row of validNewRows) {
    rows.push([row.address, row.votes]);
  }

  return rows;
}
