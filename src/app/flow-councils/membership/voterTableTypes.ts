// Shared types for the group voter table and its extracted modal / CSV helpers
// (VoterTable.tsx, MoveVoterModal.tsx, SaveConfirmModal.tsx, voterCsv.ts).

export type SubgraphVoter = {
  id: string;
  account: string;
  votingPower: string;
  ballot?: { votes?: { amount: string }[] };
};

// The subset of the chunked-tx-queue hook the voter table consumes. The parent
// (GroupDetail) wraps the raw hook to defer DB cleanup, so this is the wrapped
// shape passed down as the `q` prop.
export type ChunkedQueue = {
  startQueue: (
    councilId: string,
    chunks: { args: Record<string, unknown> }[],
    removalAddresses?: string[],
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
