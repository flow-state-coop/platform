// Shared types for the Flow Council membership UI: the group overview, the
// per-group detail page, and the voter table with its extracted modal / CSV
// helpers (membership.tsx, GroupDetail.tsx, VoterTable.tsx, MoveVoterModal.tsx,
// SaveConfirmModal.tsx, voterCsv.ts).

export type EligibilityMethod = "manual" | "gooddollar";

export type VoterGroup = {
  id: number;
  name: string;
  eligibilityMethod: EligibilityMethod;
  defaultVotingPower: number;
  memberCount: number;
  members: string[];
};

export type SubgraphVoter = {
  id: string;
  account: string;
  votingPower: string;
  ballot?: { votes?: { amount: string }[] };
};

// Offchain cleanup data persisted alongside the onchain chunk queue (as its
// `meta`) so it survives a navigation/remount. `useVoterGroupQueueCleanup`
// reads it to finalize a removal (drop DB classification rows once the queue
// fully completes) or to roll back a discarded add (drop the DB rows it inserted
// for chunks that never landed onchain). All addresses are lowercased.
export type VoterGroupQueueMeta = {
  chainId: number;
  councilId: string;
  groupId: number;
  // Removed voters whose DB classification is dropped after the removal lands
  // onchain — on full completion (finalize) or, for the committed prefix, on
  // discard (the leading `completedCount*CHUNK_SIZE - removalOffset` of them).
  removalAddresses: string[];
  // Count of non-removal entries (adds + edits) ahead of the removal block in
  // the onchain queue. Removals occupy the back, so this is where their slice of
  // the committed prefix begins.
  removalOffset: number;
  // Added voters in onchain-entry order (adds occupy the front of the queue), so
  // a partial failure's committed prefix can be derived from completedCount.
  addedOrder: string[];
  // The subset of `addedOrder` actually inserted into the DB (conflicts skipped),
  // i.e. the only rows a discard may roll back.
  insertedAddresses: string[];
};

// The subset of the chunked-tx-queue hook the voter table consumes. The parent
// wraps the raw hook so `clear` performs the discard rollback, so this is the
// wrapped shape passed down as the `q` prop.
export type ChunkedQueue = {
  startQueue: (
    councilId: string,
    chunks: { args: Record<string, unknown> }[],
    meta?: VoterGroupQueueMeta,
  ) => void;
  resume: () => void;
  clear: () => void;
  isPending: boolean;
  completedCount: number;
  totalCount: number;
  error: Error | null;
};

export type GroupOption = { id: number; name: string };

// A pending new voter row the admin is composing (or that CSV import staged).
export type NewRow = { id: number; address: string; votes: string };

// Save lifecycle, surfaced inside the confirm modal:
//   idle       — modal open, awaiting confirmation
//   saving     — offchain DB write in flight
//   submitting — onchain chunk queue running (or stopped on q.error)
//   done       — queue fully complete; modal auto-closes shortly after
export type SubmitPhase = "idle" | "saving" | "submitting" | "done";
