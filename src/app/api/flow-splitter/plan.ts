import {
  CHUNK_SIZE,
  splitIntoChunks,
} from "@/app/flow-councils/lib/chunkQueue";
import { normalizeWeightsToVotingPower } from "../normalize";

/**
 * Shares are written as parts per million, so a recipient's share reads
 * directly as a percentage to four decimal places. Rounding means the total can
 * land a few units under this, never over.
 */
export const TARGET_TOTAL_UNITS = 1_000_000n;

export type RegisterEntry = { address: string; units: bigint };

export type WritePlan = {
  /** The full desired register, zero entries omitted. */
  target: RegisterEntry[];
  /** Only the entries whose units actually move, including drops to zero. */
  changed: RegisterEntry[];
  batches: RegisterEntry[][];
  /** True when the chain already matches, which is the zero-transaction skip. */
  unchanged: boolean;
};

/**
 * Turn a payload of relative weights into the transactions needed to make the
 * pool match it.
 *
 * The payload is the complete register: any current recipient missing from it
 * is set to zero and stops receiving flow. Batching works off the diff rather
 * than the payload, so a 1000-entry payload where three shares moved is one
 * transaction, not twenty.
 *
 * Pure, with no IO: `currentRegister` is supplied by the caller from chain
 * state, never from the indexer or the mirror alone.
 */
export function planWrite(
  recipients: { address: string; weight: number }[],
  currentRegister: RegisterEntry[],
): WritePlan {
  const normalized = normalizeWeightsToVotingPower(
    recipients.map((r) => ({ recipient: r.address, weight: r.weight })),
    TARGET_TOTAL_UNITS,
    // No spread cap: unlike a council ballot, a splitter register has no limit
    // on how many recipients can hold shares.
    0,
  );

  const target: RegisterEntry[] = normalized.map((v) => ({
    address: v.recipient.toLowerCase(),
    units: v.amount,
  }));

  const changed = diffRegister(target, currentRegister);

  return {
    target,
    changed,
    batches: splitIntoChunks(changed, CHUNK_SIZE),
    unchanged: changed.length === 0,
  };
}

/**
 * The entries that have to be written to make `current` match `target`.
 *
 * Any address held in `current` but absent from `target` becomes an explicit
 * zero: the contract only touches members named in the call, so a dropped
 * recipient left out entirely would keep its shares and keep receiving flow.
 *
 * The job runner calls this before every batch against fresh chain state, which
 * is what makes a resumed job converge rather than replay.
 */
export function diffRegister(
  target: RegisterEntry[],
  current: RegisterEntry[],
): RegisterEntry[] {
  const currentByAddress = new Map(
    current.map((e) => [e.address.toLowerCase(), e.units]),
  );

  const desired = new Map(
    target.map((e) => [e.address.toLowerCase(), e.units]),
  );
  for (const address of currentByAddress.keys()) {
    if (!desired.has(address)) desired.set(address, 0n);
  }

  return [...desired.entries()]
    .filter(
      ([address, units]) => (currentByAddress.get(address) ?? 0n) !== units,
    )
    .map(([address, units]) => ({ address, units }))
    .sort((a, b) => a.address.localeCompare(b.address));
}
