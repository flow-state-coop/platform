// Pure CSV import/export logic for the group voter table. Kept side-effect free
// (no React, no DOM) so the roster-sync math can be unit tested in isolation;
// VoterTable owns the Papa.parse / Blob plumbing around these.

import { isAddress } from "viem";
import {
  isValidVotes,
  isVoterAddress,
} from "@/app/flow-councils/lib/voterUtils";
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
  // Subset of `skipped` dropped for a malformed address (a formatting issue the
  // admin should fix), as opposed to a benign already-onchain-elsewhere skip.
  invalidRows: number;
};

// An ENS-style name in the address column: no spaces, no "@" (so a stray email
// is left alone), a trailing dotted TLD, and not already a hex address.
export function isEnsName(cell: string): boolean {
  const value = cell.trim();

  if (value === "" || value.includes(" ") || value.includes("@")) {
    return false;
  }

  if (isAddress(value, { strict: false })) {
    return false;
  }

  return /^[^\s@]+\.[a-z]{2,}$/i.test(value);
}

/**
 * ENS names found in the address (first) column, to resolve before syncing.
 */
export function collectEnsNames(rows: string[][]): string[] {
  const names = new Set<string>();

  for (const row of rows) {
    const cell = (row[0] ?? "").trim();

    if (isEnsName(cell)) {
      names.add(cell);
    }
  }

  return [...names];
}

/**
 * Replace resolved ENS names (keyed by lowercased name) in the address column
 * with their addresses so the sync treats them like any other address cell.
 */
export function applyEnsResolutions(
  rows: string[][],
  resolved: Record<string, string>,
): string[][] {
  return rows.map((row) => {
    const address = resolved[(row[0] ?? "").trim().toLowerCase()];

    if (!address) {
      return row;
    }

    const next = [...row];
    next[0] = address;

    return next;
  });
}

/**
 * Validate that an uploaded file matches the template before syncing: the first
 * column must be the wallet address (ENS names are resolved beforehand) and the
 * second the vote count. A leading header row (first column not an address) is
 * tolerated. Returns an error message when no data row carries an address in the
 * first column (the wrong file, or columns in the wrong order) so the importer
 * can reject it with a pointer to the template instead of silently skipping
 * every row; returns null when the file is in template shape.
 */
export function validateCsvShape(rows: string[][]): string | null {
  const nonBlank = rows.filter((row) =>
    row.some((cell) => (cell ?? "").trim() !== ""),
  );

  if (nonBlank.length === 0) {
    return "This file is empty.";
  }

  const hasAddressColumn = nonBlank.some((row) =>
    isAddress((row[0] ?? "").trim(), { strict: false }),
  );

  if (!hasAddressColumn) {
    return (
      "Couldn't read this file. Put the wallet address (or ENS name) in the " +
      "first column and the vote count in the second, like the template."
    );
  }

  return null;
}

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
  let invalidRows = 0;

  for (const row of rows) {
    const address = (row[0] ?? "").trim();

    if (address === "") {
      continue;
    }

    if (!isVoterAddress(address)) {
      skipped++;
      invalidRows++;
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

  return { nextEdited, nextRemoved, nextNew, skipped, invalidRows };
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
