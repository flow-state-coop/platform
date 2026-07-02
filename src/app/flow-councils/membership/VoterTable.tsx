"use client";

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
} from "react";
import { Address, isAddress } from "viem";
import Papa from "papaparse";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Table from "react-bootstrap/Table";
import Dropdown from "react-bootstrap/Dropdown";
import Alert from "react-bootstrap/Alert";
import Pagination from "react-bootstrap/Pagination";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { resolveDisplayName, truncateAddress } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import {
  CHUNK_SIZE,
  splitIntoChunks,
} from "@/app/flow-councils/hooks/useChunkedTxQueue";
import {
  computeCastVotes,
  computeNewVotingPower,
  pctCast,
  passesPctFilter,
  totalPages,
  isValidVotes,
} from "@/app/flow-councils/lib/voterUtils";
import MoveVoterModal from "./MoveVoterModal";
import SaveConfirmModal from "./SaveConfirmModal";
import { computeCsvSync, buildCsvRows } from "./voterCsv";
import type {
  ChunkedQueue,
  GroupOption,
  NewRow,
  SubgraphVoter,
  SubmitPhase,
} from "./voterTableTypes";

type VoterTableProps = {
  chainId: number;
  councilId: string;
  groupId: number;
  defaultVotingPower: number;
  voters: SubgraphVoter[];
  allGroups: GroupOption[];
  existingOnchainAccounts: string[];
  isManager: boolean;
  q: ChunkedQueue;
  maxVotingSpread: number;
  onRefresh: () => Promise<void> | void;
};

const PAGE_SIZE = 50;
// Display-name lookups go out as a GET with the addresses in the query string.
// At ~43 chars per address this keeps the URL well under the ~8KB some
// proxies/CDNs truncate at (150 × 43 ≈ 6.5KB), while the endpoint stays
// ISR-cacheable. The profiles route still accepts up to 500 per request.
const PROFILE_BATCH = 150;

const PCT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "0", label: "> 0% cast" },
  { value: "25", label: "> 25% cast" },
  { value: "50", label: "> 50% cast" },
  { value: "80", label: "> 80% cast" },
  { value: "100", label: "100% cast" },
] as const;

// Row-actions dropdown toggle: a plain three-dots button. react-bootstrap's
// DropdownToggle always merges the `dropdown-toggle` class (even with `as`),
// which renders a ▼ via its ::after pseudo-element; the `no-caret` class
// suppresses it (see styles.scss).
const RowActionsToggle = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className = "", children, ...props }, ref) => (
  <button
    type="button"
    ref={ref}
    className={`btn btn-sm btn-outline-secondary fw-semi-bold border-0 no-caret ${className}`}
    {...props}
  >
    {children}
  </button>
));
RowActionsToggle.displayName = "RowActionsToggle";

// Parse the address-search box into a set of lowercased addresses when the user
// pasted a newline/comma-separated list; otherwise treat the trimmed text as a
// single substring needle.
function parseAddressSearch(raw: string): {
  list: Set<string>;
  needle: string;
} {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  if (tokens.length > 1) {
    return { list: new Set(tokens), needle: "" };
  }

  return { list: new Set(), needle: raw.trim().toLowerCase() };
}

export default function VoterTable(props: VoterTableProps) {
  const {
    chainId,
    councilId,
    groupId,
    defaultVotingPower,
    voters,
    allGroups,
    existingOnchainAccounts,
    isManager,
    q,
    maxVotingSpread,
    onRefresh,
  } = props;

  const [names, setNames] = useState<Record<string, string>>({});

  const [addressSearch, setAddressSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [pctFilter, setPctFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Filtering is debounced so a narrowing keystroke doesn't re-page the table
  // and fan out a fresh page of ENS lookups per character typed.
  const debouncedAddressSearch = useDebouncedValue(addressSearch, 300);
  const debouncedNameSearch = useDebouncedValue(nameSearch, 300);

  // Staged edits — committed together by Save.
  // editedPower: acct(lowercase) -> new votes string (only present when changed).
  // removed: accts staged for removal (onchain power → 0 + DB classification drop).
  // newRows: pending add rows with their own editable address + votes.
  const [editedPower, setEditedPower] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const newRowId = useRef(0);

  const [bulkValue, setBulkValue] = useState("");
  const [bulkMode, setBulkMode] = useState<"set" | "increment">("set");

  const [importNote, setImportNote] = useState("");

  // Save lifecycle (see SubmitPhase), surfaced entirely inside the confirm modal
  // so the flow matches the rest of the platform (spinner → checkmark → close).
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [saveError, setSaveError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const [moveTarget, setMoveTarget] = useState<SubgraphVoter | null>(null);
  const [moveToGroupId, setMoveToGroupId] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [moveSuccess, setMoveSuccess] = useState("");

  // Lowercased accounts already onchain (any group) — CSV sync and new-row save
  // skip these so we never re-add (or clobber another group's) existing voter.
  const existingOnchainSet = useMemo(
    () => new Set(existingOnchainAccounts.map((a) => a.toLowerCase())),
    [existingOnchainAccounts],
  );

  // Stable signature of the voter set: the `voters` prop is a new array on every
  // parent render / Apollo re-poll even when the addresses are unchanged, so the
  // profile fetch keys off the joined string to avoid redundant network calls.
  const sortedAddresses = useMemo(
    () => voters.map((v) => v.account.toLowerCase()).sort(),
    [voters],
  );
  const voterAddressKey = useMemo(
    () => sortedAddresses.join(","),
    [sortedAddresses],
  );

  // Read the array directly in the effect (via a ref) so it gates on the stable
  // key but never round-trips the (potentially large) string back through split.
  const sortedAddressesRef = useRef(sortedAddresses);
  sortedAddressesRef.current = sortedAddresses;

  // Fetch display names for the visible addresses once the voter list loads.
  useEffect(() => {
    if (voterAddressKey === "") {
      return;
    }

    const addresses = sortedAddressesRef.current;

    let cancelled = false;

    const run = async () => {
      const merged: Record<string, string> = {};

      for (const batch of splitIntoChunks(addresses, PROFILE_BATCH)) {
        try {
          const res = await fetch("/api/flow-council/voter-groups/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: batch }),
          });
          const data = await res.json();

          if (data.success && data.names) {
            for (const [addr, name] of Object.entries(
              data.names as Record<string, string>,
            )) {
              merged[addr.toLowerCase()] = name;
            }
          }
        } catch (err) {
          console.error(err);
        }
      }

      if (!cancelled) {
        setNames(merged);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [voterAddressKey]);

  // The votes currently shown for an existing voter: the staged edit if any,
  // else the committed onchain value.
  const shownVotes = useCallback(
    (voter: SubgraphVoter): string =>
      editedPower[voter.account.toLowerCase()] ?? voter.votingPower,
    [editedPower],
  );

  const filteredVoters = useMemo(() => {
    const { list, needle } = parseAddressSearch(debouncedAddressSearch);
    const nameNeedle = debouncedNameSearch.trim().toLowerCase();

    return voters.filter((voter) => {
      const account = voter.account.toLowerCase();
      const profileName = names[account] ?? "";

      if (list.size > 0) {
        if (!list.has(account)) {
          return false;
        }
      } else if (needle && !account.includes(needle)) {
        return false;
      }

      if (nameNeedle && !profileName.toLowerCase().includes(nameNeedle)) {
        return false;
      }

      if (pctFilter !== "all") {
        const cast = computeCastVotes(voter);
        const allocation = Number(voter.votingPower);

        if (pctFilter === "100") {
          if (pctCast(cast, allocation) < 100) {
            return false;
          }
        } else if (!passesPctFilter(cast, allocation, Number(pctFilter))) {
          return false;
        }
      }

      return true;
    });
  }, [voters, debouncedAddressSearch, debouncedNameSearch, pctFilter, names]);

  const pageCount = totalPages(filteredVoters.length, PAGE_SIZE);

  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount));
  }, [pageCount]);

  const pageVoters = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;

    return filteredVoters.slice(start, start + PAGE_SIZE);
  }, [filteredVoters, page]);

  // Resolve ENS only for the addresses actually on screen: the roster can run to
  // thousands of voters, so resolving the whole list would fan out that many
  // mainnet reverse lookups. The visible page (≤ PAGE_SIZE) is all we render.
  // Sorted so an Apollo re-poll that reorders the same membership doesn't
  // change the hook's key and refetch.
  const pageAddresses = useMemo(
    () => pageVoters.map((voter) => voter.account.toLowerCase()).sort(),
    [pageVoters],
  );

  const { ensByAddress } = useEnsResolution(pageAddresses, { avatars: false });

  const otherGroups = useMemo(
    () => allGroups.filter((g) => g.id !== groupId),
    [allGroups, groupId],
  );

  // --- Staged-change accounting --------------------------------------------

  // New rows the admin actually intends to add: non-empty, valid address, not
  // already onchain, deduped within the staged set.
  const validNewRows = useMemo(() => {
    const seen = new Set<string>();
    const valid: NewRow[] = [];

    for (const row of newRows) {
      const addr = row.address.trim().toLowerCase();

      if (
        !isAddress(row.address.trim(), { strict: false }) ||
        !isValidVotes(row.votes) ||
        existingOnchainSet.has(addr) ||
        seen.has(addr)
      ) {
        continue;
      }

      seen.add(addr);
      valid.push(row);
    }

    return valid;
  }, [newRows, existingOnchainSet]);

  // A new row is "problematic" when it has content but isn't a clean, addable
  // entry — surfaced so Save can be blocked and the row flagged.
  const newRowErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Set<string>();

    for (const row of newRows) {
      const address = row.address.trim();
      const addr = address.toLowerCase();

      if (address === "" && row.votes.trim() === "") {
        continue;
      }

      if (!isAddress(address, { strict: false })) {
        errors[row.id] = "Invalid address";
      } else if (existingOnchainSet.has(addr)) {
        errors[row.id] = "Already a voter";
      } else if (seen.has(addr)) {
        errors[row.id] = "Duplicate";
      } else if (!isValidVotes(row.votes)) {
        errors[row.id] = "Votes must be 1–1M";
      }

      if (isAddress(address, { strict: false })) {
        seen.add(addr);
      }
    }

    return errors;
  }, [newRows, existingOnchainSet]);

  // Existing voters whose staged votes differ from the committed value (and that
  // aren't being removed).
  const changedAccounts = useMemo(() => {
    const changed: string[] = [];

    for (const voter of voters) {
      const acct = voter.account.toLowerCase();
      const edit = editedPower[acct];

      if (
        edit !== undefined &&
        !removed.has(acct) &&
        isValidVotes(edit) &&
        Number(edit) !== Number(voter.votingPower)
      ) {
        changed.push(acct);
      }
    }

    return changed;
  }, [voters, editedPower, removed]);

  // Accounts actually staged for removal that still belong to this group.
  const removedAccounts = useMemo(() => {
    const groupAccts = new Set(voters.map((v) => v.account.toLowerCase()));

    return Array.from(removed).filter((acct) => groupAccts.has(acct));
  }, [voters, removed]);

  const hasChanges =
    validNewRows.length > 0 ||
    changedAccounts.length > 0 ||
    removedAccounts.length > 0;

  const hasErrors = Object.keys(newRowErrors).length > 0;

  // Voters affected by the pending change that have already cast — the mid-round
  // warning surfaced in the confirm dialog.
  const castWarningCount = useMemo(() => {
    const byAccount = new Map(voters.map((v) => [v.account.toLowerCase(), v]));
    let count = 0;

    for (const acct of removedAccounts) {
      if (computeCastVotes(byAccount.get(acct)!) > 0) {
        count++;
      }
    }

    for (const acct of changedAccounts) {
      const voter = byAccount.get(acct)!;
      const cast = computeCastVotes(voter);

      if (cast > 0 && Number(editedPower[acct]) < cast) {
        count++;
      }
    }

    return count;
  }, [voters, removedAccounts, changedAccounts, editedPower]);

  // --- Staged-edit handlers -------------------------------------------------

  const setExistingVotes = (voter: SubgraphVoter, value: string) => {
    if (value !== "" && !(/^\d+$/.test(value) && Number(value) <= 1e6)) {
      return;
    }

    setEditedPower((prev) => ({
      ...prev,
      [voter.account.toLowerCase()]: value,
    }));
  };

  // Stage every currently-filtered voter for removal. The Save preview shows the
  // count before anything is committed.
  const removeFiltered = () => {
    setRemoved((prev) => {
      const next = new Set(prev);

      for (const voter of filteredVoters) {
        next.add(voter.account.toLowerCase());
      }

      return next;
    });
  };

  const toggleRemove = (voter: SubgraphVoter) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      const acct = voter.account.toLowerCase();

      if (next.has(acct)) {
        next.delete(acct);
      } else {
        next.add(acct);
      }

      return next;
    });
  };

  const addNewRow = () => {
    setNewRows((prev) => [
      ...prev,
      {
        id: ++newRowId.current,
        address: "",
        votes: String(defaultVotingPower),
      },
    ]);
  };

  const updateNewRow = (id: number, patch: Partial<NewRow>) => {
    setNewRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const removeNewRow = (id: number) => {
    setNewRows((prev) => prev.filter((row) => row.id !== id));
  };

  // Apply the bulk votes value (set or increment) to a set of existing voters,
  // staged only. "Apply to all" also fills the pending new rows.
  const applyBulk = (targets: SubgraphVoter[], includeNewRows: boolean) => {
    const value = Number(bulkValue);

    if (!isValidVotes(bulkValue)) {
      return;
    }

    setEditedPower((prev) => {
      const next = { ...prev };

      for (const voter of targets) {
        const acct = voter.account.toLowerCase();
        const current = Number(next[acct] ?? voter.votingPower);

        next[acct] = String(computeNewVotingPower(current, value, bulkMode));
      }

      return next;
    });

    if (includeNewRows) {
      setNewRows((prev) =>
        prev.map((row) => ({
          ...row,
          votes:
            bulkMode === "set"
              ? String(value)
              : String(Number(row.votes || 0) + value),
        })),
      );
    }
  };

  // --- CSV ------------------------------------------------------------------

  // Sync this group's roster to the uploaded file: rows in the file are
  // added/updated; existing members absent from the file are staged for removal.
  // The roster-sync math lives in voterCsv (pure + unit tested); here we only
  // assign row ids and surface the import summary.
  const handleCsvImport = (file: File) => {
    Papa.parse(file, {
      complete: (results: { data: string[][] }) => {
        const { nextEdited, nextRemoved, nextNew, skipped } = computeCsvSync(
          results.data,
          voters,
          existingOnchainSet,
          defaultVotingPower,
        );

        setEditedPower(nextEdited);
        setRemoved(nextRemoved);
        setNewRows(nextNew.map((row) => ({ id: ++newRowId.current, ...row })));

        const changed = Object.keys(nextEdited).length;
        setImportNote(
          `Imported: ${nextNew.length} to add, ${changed} changed, ` +
            `${nextRemoved.size} to remove` +
            (skipped > 0 ? ` (${skipped} row(s) skipped)` : ""),
        );
      },
    });
  };

  const handleCsvExport = () => {
    const rows = buildCsvRows(voters, removed, shownVotes, validNewRows);
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "voters.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- Move (offchain, immediate) ------------------------------------------

  const openMoveModal = useCallback(
    (voter: SubgraphVoter) => {
      setMoveError("");
      setMoveSuccess("");
      setMoveTarget(voter);
      setMoveToGroupId(otherGroups[0] ? String(otherGroups[0].id) : "");
    },
    [otherGroups],
  );

  const handleMove = async () => {
    if (!moveTarget || !moveToGroupId) {
      return;
    }

    try {
      setIsMoving(true);
      setMoveError("");

      const res = await fetch("/api/flow-council/voter-groups/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          councilId,
          address: moveTarget.account,
          newGroupId: Number(moveToGroupId),
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setMoveError(data.error ?? "Failed to move voter");
        return;
      }

      setMoveTarget(null);
      setMoveSuccess("Moved — allocation unchanged (no transaction).");
      await onRefresh();
    } catch (err) {
      console.error(err);
      setMoveError("Failed to move voter");
    } finally {
      setIsMoving(false);
    }
  };

  // --- Save (single commit) -------------------------------------------------

  const handleSave = async () => {
    if (!hasChanges || hasErrors) {
      return;
    }

    try {
      setSubmitPhase("saving");
      setSaveError("");

      const byAccount = new Map(
        voters.map((v) => [v.account.toLowerCase(), v]),
      );

      // Offchain: classify every new address into this group (DB) in one batched
      // request before the onchain queue. Bail out on failure so we never enqueue
      // onchain allocations for voters with no group membership.
      let insertedAddresses: string[] = [];

      if (validNewRows.length > 0) {
        const res = await fetch("/api/flow-council/voter-groups/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            councilId,
            groupId,
            addresses: validNewRows.map((row) => row.address),
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          setSaveError(data?.error ?? "Failed to add voters");
          setSubmitPhase("idle");
          return;
        }

        // Track the addresses actually inserted (returned by the endpoint) for a
        // possible discard-rollback. Skipped addresses already belonged to
        // another group on this council, so rolling them back would delete that
        // group's row — they are excluded server-side, never tracked here.
        if (Array.isArray(data.insertedAddresses)) {
          insertedAddresses = data.insertedAddresses.map((addr: string) =>
            addr.toLowerCase(),
          );
        }
      }

      // Onchain: one updateVoters covering adds (set power), edits (new power)
      // and removals (power 0). maxVotingSpread is passed verbatim on every chunk
      // so a paused/failed queue never resets the council-wide spread.
      const entries = [
        ...validNewRows.map((row) => ({
          account: row.address.toLowerCase() as Address,
          votingPower: BigInt(row.votes),
          votes: [] as [],
        })),
        ...changedAccounts.map((acct) => ({
          account: byAccount.get(acct)!.account as Address,
          votingPower: BigInt(editedPower[acct]),
          votes: [] as [],
        })),
        ...removedAccounts.map((acct) => ({
          account: byAccount.get(acct)!.account as Address,
          votingPower: BigInt(0),
          votes: [] as [],
        })),
      ];

      const chunks = splitIntoChunks(entries, CHUNK_SIZE).map((slice) => ({
        args: {
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "updateVoters",
          args: [slice, maxVotingSpread],
        },
      }));

      // Persist everything the deferred DB cleanup needs alongside the queue so
      // it survives a remount: removed voters' DB rows are dropped once their
      // removal lands onchain, inserted adds are rolled back on discard. The
      // entry order (adds, then edits, then removals) lets the cleanup derive a
      // partial failure's committed prefix from the queue's completedCount —
      // `addedOrder` for the leading adds, `removalOffset` for the trailing
      // removals.
      q.startQueue(councilId, chunks, {
        chainId,
        councilId,
        groupId,
        removalAddresses: removedAccounts,
        removalOffset: entries.length - removedAccounts.length,
        addedOrder: validNewRows.map((row) => row.address.toLowerCase()),
        insertedAddresses,
      });

      // Progress, completion and failure are now driven by the queue state and
      // observed in the effects below; the modal stays open as the surface.
      setSubmitPhase("submitting");
    } catch (err) {
      console.error(err);
      setSaveError("Failed to save changes");
      setSubmitPhase("idle");
    }
  };

  // --- Submission lifecycle -------------------------------------------------

  // While the onchain queue runs, advance to "done" once every chunk has
  // settled. A queue failure (q.error) is left in "submitting" so the modal can
  // offer Retry; clearing the error and resuming re-enters this check.
  useEffect(() => {
    if (submitPhase !== "submitting" || q.error) {
      return;
    }

    if (q.totalCount > 0 && q.completedCount === q.totalCount && !q.isPending) {
      setSubmitPhase("done");
    }
  }, [submitPhase, q.error, q.totalCount, q.completedCount, q.isPending]);

  // After a successful submission, briefly show the green checkmark, then close
  // the modal and drop the now-committed staged edits.
  useEffect(() => {
    if (submitPhase !== "done") {
      return;
    }

    const timeout = setTimeout(() => {
      setNewRows([]);
      setEditedPower({});
      setRemoved(new Set());
      setImportNote("");
      setShowConfirm(false);
      setSubmitPhase("idle");
    }, 1200);

    return () => clearTimeout(timeout);
  }, [submitPhase]);

  // True whenever the confirm modal is mid-submission and must not be dismissed
  // or re-triggered (an in-flight queue error is the one interactive exception).
  const submitBusy =
    submitPhase === "saving" ||
    submitPhase === "done" ||
    (submitPhase === "submitting" && !q.error);

  const closeConfirm = () => {
    // Dismissing a stopped (failed) queue discards it so no stale "resume"
    // banner lingers; the staged edits remain so the admin can retry via Save.
    // The wrapped clear (q.clear === the parent's rollback-aware discard) drops
    // the DB rows inserted for adds whose chunk never landed onchain.
    if (q.error) {
      q.clear();
    }

    setSubmitPhase("idle");
    setShowConfirm(false);
  };

  // Discard every staged edit (new rows, vote changes, removals) and the import
  // summary, returning the table to the committed onchain state.
  const discardStaged = () => {
    setNewRows([]);
    setEditedPower({});
    setRemoved(new Set());
    setImportNote("");
    setSaveError("");
  };

  const paginationItems = useMemo(() => {
    if (pageCount <= 1) {
      return [];
    }

    const pages = new Set<number>([1, pageCount]);

    for (let p = page - 1; p <= page + 1; p++) {
      if (p >= 1 && p <= pageCount) {
        pages.add(p);
      }
    }

    const sorted = Array.from(pages).sort((a, b) => a - b);
    const items = [];
    let prev = 0;

    for (const p of sorted) {
      if (p - prev > 1) {
        items.push(<Pagination.Ellipsis key={`gap-${p}`} disabled />);
      }

      items.push(
        <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>
          {p}
        </Pagination.Item>,
      );

      prev = p;
    }

    return items;
  }, [pageCount, page]);

  const bulkValid = isValidVotes(bulkValue);

  return (
    <Stack direction="vertical" gap={3}>
      {/* Bulk apply toolbar */}
      {isManager ? (
        <Stack
          direction="horizontal"
          gap={3}
          className="flex-wrap align-items-end mb-3"
        >
          <Form.Group style={{ minWidth: 120 }}>
            <Form.Label className="fw-semi-bold mb-1">
              Batch Vote Updates
            </Form.Label>
            <Form.Control
              type="text"
              inputMode="numeric"
              placeholder="e.g. 10"
              value={bulkValue}
              disabled={q.isPending}
              onChange={(e) => {
                const v = e.target.value;

                if (v === "" || (/^\d+$/.test(v) && Number(v) <= 1e6)) {
                  setBulkValue(v);
                }
              }}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="fw-semi-bold mb-1 d-block">Mode</Form.Label>
            <Stack direction="horizontal" gap={3}>
              <Form.Check
                type="radio"
                id="bulk-mode-set"
                name="bulk-mode"
                label="Set"
                checked={bulkMode === "set"}
                onChange={() => setBulkMode("set")}
              />
              <Form.Check
                type="radio"
                id="bulk-mode-increment"
                name="bulk-mode"
                label="Increment"
                checked={bulkMode === "increment"}
                onChange={() => setBulkMode("increment")}
              />
            </Stack>
          </Form.Group>
          <Button
            variant="outline-primary"
            className="rounded-4 px-3 py-2 fw-semi-bold"
            disabled={!bulkValid || voters.length === 0 || q.isPending}
            onClick={() => applyBulk(voters, true)}
          >
            Apply to all
          </Button>
          <Button
            variant="outline-primary"
            className="rounded-4 px-3 py-2 fw-semi-bold"
            disabled={!bulkValid || filteredVoters.length === 0 || q.isPending}
            onClick={() => applyBulk(filteredVoters, false)}
          >
            Apply to filtered ({filteredVoters.length})
          </Button>
          <Button
            variant="danger"
            className="rounded-4 px-3 py-2 fw-semi-bold text-white ms-auto"
            disabled={filteredVoters.length === 0 || q.isPending}
            onClick={removeFiltered}
            title="Removes the currently filtered voters from the council. Clear filters to remove the whole group."
          >
            Remove filtered ({filteredVoters.length})
          </Button>
        </Stack>
      ) : null}

      {/* Filter — one labelled section; each control's placeholder/options
          explain what it does (address list, profile name, % of votes cast). */}
      <Stack
        direction="horizontal"
        gap={2}
        className="flex-wrap align-items-end"
      >
        <Form.Group style={{ minWidth: 220, flex: "1 1 220px" }}>
          <Form.Label className="fw-semi-bold mb-1">Filter</Form.Label>
          <Form.Control
            type="text"
            placeholder="0x123…5678 or paste a list"
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
          />
        </Form.Group>
        <Form.Group style={{ minWidth: 180, flex: "1 1 180px" }}>
          <Form.Control
            type="text"
            placeholder="Profile name"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
          />
        </Form.Group>
        <Form.Group style={{ minWidth: 140 }}>
          <Form.Select
            value={pctFilter}
            onChange={(e) => setPctFilter(e.target.value)}
          >
            {PCT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Stack>

      {importNote ? (
        <Alert
          variant="info"
          dismissible
          onClose={() => setImportNote("")}
          className="mb-0"
        >
          {importNote}
        </Alert>
      ) : null}
      {moveSuccess ? (
        <Alert variant="success" className="mb-0">
          {moveSuccess}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert variant="danger" className="mb-0">
          {saveError}
        </Alert>
      ) : null}

      <Table responsive hover className="bg-white rounded-4 mb-0">
        <thead>
          <tr>
            <th className="fw-semi-bold">Address</th>
            <th className="fw-semi-bold">Name</th>
            <th className="fw-semi-bold text-end">Vote allocation</th>
            <th className="fw-semi-bold text-end">Votes cast</th>
            {isManager ? <th className="fw-semi-bold text-end" /> : null}
          </tr>
        </thead>
        <tbody>
          {/* Pending new rows — always visible, above the paginated list. */}
          {isManager
            ? newRows.map((row) => {
                const error = newRowErrors[row.id];

                return (
                  <tr key={`new-${row.id}`} className="table-light">
                    <td>
                      <Form.Control
                        type="text"
                        size="sm"
                        placeholder="0x… (new)"
                        value={row.address}
                        isInvalid={!!error}
                        disabled={q.isPending}
                        onChange={(e) =>
                          updateNewRow(row.id, { address: e.target.value })
                        }
                      />
                    </td>
                    <td className="text-info align-middle">
                      {error ? (
                        <span className="text-danger small">{error}</span>
                      ) : (
                        "New voter"
                      )}
                    </td>
                    <td className="text-end" style={{ maxWidth: 120 }}>
                      <Form.Control
                        type="text"
                        inputMode="numeric"
                        size="sm"
                        className="text-end"
                        value={row.votes}
                        disabled={q.isPending}
                        onChange={(e) => {
                          const v = e.target.value;

                          if (
                            v === "" ||
                            (/^\d+$/.test(v) && Number(v) <= 1e6)
                          ) {
                            updateNewRow(row.id, { votes: v });
                          }
                        }}
                      />
                    </td>
                    <td className="text-end text-info align-middle">—</td>
                    <td className="text-end align-middle">
                      <Button
                        variant="transparent"
                        size="sm"
                        className="text-danger border-0 fw-semi-bold"
                        disabled={q.isPending}
                        onClick={() => removeNewRow(row.id)}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })
            : null}

          {pageVoters.length === 0 && newRows.length === 0 ? (
            <tr>
              <td colSpan={isManager ? 5 : 4} className="text-info text-center">
                No voters match.
              </td>
            </tr>
          ) : (
            pageVoters.map((voter) => {
              const account = voter.account.toLowerCase();
              const name = names[account];
              const isRemoved = removed.has(account);
              const cast = computeCastVotes(voter);

              return (
                <tr
                  key={voter.id}
                  className={isRemoved ? "text-decoration-line-through" : ""}
                >
                  <td>
                    <span className="text-break">
                      {truncateAddress(account)}
                    </span>
                  </td>
                  <td>
                    <span className="fw-semi-bold text-break">
                      {resolveDisplayName(
                        name,
                        ensByAddress?.[account]?.name,
                        account,
                      )}
                    </span>
                  </td>
                  <td className="text-end" style={{ maxWidth: 120 }}>
                    {isManager && !isRemoved ? (
                      <Form.Control
                        type="text"
                        inputMode="numeric"
                        size="sm"
                        className="text-end"
                        value={shownVotes(voter)}
                        disabled={q.isPending}
                        onChange={(e) =>
                          setExistingVotes(voter, e.target.value)
                        }
                      />
                    ) : (
                      shownVotes(voter)
                    )}
                  </td>
                  <td className="text-end">
                    {cast} / {shownVotes(voter)}
                  </td>
                  {isManager ? (
                    <td className="text-end">
                      {isRemoved ? (
                        <Button
                          variant="transparent"
                          size="sm"
                          className="text-primary border-0 fw-semi-bold"
                          disabled={q.isPending}
                          onClick={() => toggleRemove(voter)}
                        >
                          Undo
                        </Button>
                      ) : (
                        <Dropdown align="end">
                          <Dropdown.Toggle
                            as={RowActionsToggle}
                            disabled={q.isPending}
                          >
                            ⋯
                          </Dropdown.Toggle>
                          {/* strategy:"fixed" lets the menu escape the
                              responsive table's overflow so the last row's
                              menu is never clipped. */}
                          <Dropdown.Menu
                            className="border-0"
                            renderOnMount
                            popperConfig={{ strategy: "fixed" }}
                          >
                            <Dropdown.Item
                              disabled={otherGroups.length === 0}
                              onClick={() => openMoveModal(voter)}
                            >
                              Move to group…
                            </Dropdown.Item>
                            <Dropdown.Item
                              className="text-danger"
                              onClick={() => toggleRemove(voter)}
                            >
                              Remove
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}

          {/* Inline add row — kept adjacent to the roster so adding a member
              reads as part of the table, not a detached action below it. */}
          {isManager ? (
            <tr>
              <td colSpan={5} className="p-0">
                <Button
                  variant="transparent"
                  className="p-2 text-primary text-decoration-underline fw-semi-bold"
                  disabled={q.isPending}
                  onClick={addNewRow}
                >
                  + Add another member
                </Button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>

      {pageCount > 1 ? (
        <Pagination className="mb-0 flex-wrap">{paginationItems}</Pagination>
      ) : null}

      {/* Bulk import/export via CSV. (Add another member lives inline in the
          table above.) */}
      {isManager ? (
        <Stack direction="vertical" gap={1}>
          <Stack
            direction="horizontal"
            gap={2}
            className="flex-wrap align-items-center justify-content-end"
          >
            <Button
              variant="secondary"
              className="rounded-4 px-8 py-3 fw-semi-bold text-light"
              onClick={handleCsvExport}
            >
              Export Current
            </Button>
            <Form.Label
              htmlFor="voters-csv"
              className={`bg-primary text-white text-center m-0 px-8 py-3 rounded-4 fw-semi-bold ${
                q.isPending ? "opacity-50" : "cursor-pointer"
              }`}
            >
              Upload CSV
            </Form.Label>
            <Form.Control
              type="file"
              id="voters-csv"
              accept=".csv"
              hidden
              disabled={q.isPending}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target.files && e.target.files[0]) {
                  handleCsvImport(e.target.files[0]);
                  e.target.value = "";
                }
              }}
            />
          </Stack>
          <a
            href="https://docs.google.com/spreadsheets/d/1BKo20lc4ZdRWKjvxQuTcOldQo_qL7Y5tXOvhFMJlwug/edit?gid=0#gid=0"
            target="_blank"
            rel="noreferrer"
            className="align-self-end pe-1 text-primary text-decoration-underline fw-semi-bold"
          >
            Template
          </a>
        </Stack>
      ) : null}

      {/* Submit / Cancel */}
      {isManager ? (
        <Stack direction="vertical" gap={2}>
          {hasChanges ? (
            <span className="text-info text-center">
              {validNewRows.length} to add · {changedAccounts.length} changed ·{" "}
              {removedAccounts.length} to remove
            </span>
          ) : null}
          <Button
            className="fs-lg fw-semi-bold py-4 rounded-4"
            disabled={
              !hasChanges || hasErrors || q.isPending || submitPhase !== "idle"
            }
            onClick={() => {
              setSaveError("");
              setShowConfirm(true);
            }}
          >
            Submit
          </Button>
          <Button
            variant="danger"
            className="fs-lg fw-semi-bold py-4 rounded-4 text-white"
            disabled={!hasChanges || q.isPending || submitPhase !== "idle"}
            onClick={discardStaged}
          >
            Cancel
          </Button>
        </Stack>
      ) : null}

      {/* Move modal */}
      <MoveVoterModal
        target={moveTarget}
        otherGroups={otherGroups}
        selectedGroupId={moveToGroupId}
        isMoving={isMoving}
        error={moveError}
        onSelectGroup={setMoveToGroupId}
        onCancel={() => setMoveTarget(null)}
        onMove={handleMove}
      />

      {/* Save confirm modal */}
      <SaveConfirmModal
        show={showConfirm}
        addCount={validNewRows.length}
        changeCount={changedAccounts.length}
        removeCount={removedAccounts.length}
        castWarningCount={castWarningCount}
        submitPhase={submitPhase}
        saveError={saveError}
        submitBusy={submitBusy}
        q={q}
        onConfirm={handleSave}
        onClose={closeConfirm}
      />
    </Stack>
  );
}
