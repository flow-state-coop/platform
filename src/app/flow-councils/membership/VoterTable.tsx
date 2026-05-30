"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Address } from "viem";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Table from "react-bootstrap/Table";
import Dropdown from "react-bootstrap/Dropdown";
import Modal from "react-bootstrap/Modal";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Pagination from "react-bootstrap/Pagination";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { splitIntoChunks } from "@/app/flow-councils/hooks/useChunkedTxQueue";
import {
  computeCastVotes,
  pctCast,
  passesPctFilter,
  totalPages,
} from "@/app/flow-councils/lib/voterUtils";

type SubgraphVoter = {
  id: string;
  account: string;
  votingPower: string;
  ballot?: { votes?: { amount: string }[] };
};

type ChunkedQueue = {
  startQueue: (
    councilId: string,
    chunks: { args: Record<string, unknown> }[],
    removalAddresses?: string[],
  ) => void;
};

type GroupOption = { id: number; name: string };

type VoterTableProps = {
  chainId: number;
  councilId: string;
  groupId: number;
  groupMembers: string[];
  voters: SubgraphVoter[];
  allGroups: GroupOption[];
  isManager: boolean;
  q: ChunkedQueue;
  maxVotingSpread: number;
  onRefresh: () => Promise<void> | void;
  onFilteredChange: (filtered: SubgraphVoter[]) => void;
};

const PAGE_SIZE = 50;
const PROFILE_BATCH = 500;

// The "% cast" select. "100%" is implemented as pctCast >= 100 (special-cased
// below) rather than a strict-greater threshold; everything else uses the
// strict ">" passesPctFilter predicate.
const PCT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "0", label: "> 0%" },
  { value: "25", label: "> 25%" },
  { value: "50", label: "> 50%" },
  { value: "80", label: "> 80%" },
  { value: "100", label: "100%" },
] as const;

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

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
    voters,
    allGroups,
    isManager,
    q,
    maxVotingSpread,
    onRefresh,
    onFilteredChange,
  } = props;

  const [names, setNames] = useState<Record<string, string>>({});

  const [addressSearch, setAddressSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [pctFilter, setPctFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [moveTarget, setMoveTarget] = useState<SubgraphVoter | null>(null);
  const [moveToGroupId, setMoveToGroupId] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [moveSuccess, setMoveSuccess] = useState("");

  const [removeTarget, setRemoveTarget] = useState<SubgraphVoter | null>(null);
  const [removeError, setRemoveError] = useState("");

  // Fetch display names for the visible addresses once the voter list loads.
  // Chunk the request so we never exceed the profiles endpoint's per-call cap.
  useEffect(() => {
    const addresses = voters.map((v) => v.account.toLowerCase());

    if (addresses.length === 0) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const merged: Record<string, string> = {};

      for (const batch of splitIntoChunks(addresses, PROFILE_BATCH)) {
        try {
          const res = await fetch(
            `/api/flow-council/voter-groups/profiles?addresses=${batch.join(",")}`,
          );
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
  }, [voters]);

  const filteredVoters = useMemo(() => {
    const { list, needle } = parseAddressSearch(addressSearch);
    const nameNeedle = nameSearch.trim().toLowerCase();

    return voters.filter((voter) => {
      const account = voter.account.toLowerCase();
      const profileName = names[account] ?? "";

      // Address filter: either match against the pasted list, or substring.
      if (list.size > 0) {
        if (!list.has(account)) {
          return false;
        }
      } else if (needle && !account.includes(needle)) {
        return false;
      }

      // Profile name filter (substring, case-insensitive).
      if (nameNeedle && !profileName.toLowerCase().includes(nameNeedle)) {
        return false;
      }

      // % cast filter.
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
  }, [voters, addressSearch, nameSearch, pctFilter, names]);

  // Expose the filtered set so the bulk toolbar's "Apply to filtered" targets it.
  useEffect(() => {
    onFilteredChange(filteredVoters);
  }, [filteredVoters, onFilteredChange]);

  const pageCount = totalPages(filteredVoters.length, PAGE_SIZE);

  // Clamp the current page when the filtered set shrinks below it.
  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount));
  }, [pageCount]);

  const pageVoters = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;

    return filteredVoters.slice(start, start + PAGE_SIZE);
  }, [filteredVoters, page]);

  const otherGroups = useMemo(
    () => allGroups.filter((g) => g.id !== groupId),
    [allGroups, groupId],
  );

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

  const handleRemove = () => {
    if (!removeTarget) {
      return;
    }

    // Onchain: removal sets votingPower to 0 via updateVoters — the same
    // batchable primitive bulk-remove uses. maxVotingSpread is passed verbatim
    // so a removal never disturbs the council-wide spread. The address is handed
    // to the queue so the parent drops its DB classification row ONLY after the
    // onchain queue completes — a failed/paused queue never leaves the voter
    // classified-but-removed (or vice versa).
    q.startQueue(
      councilId,
      [
        {
          args: {
            address: councilId as Address,
            abi: flowCouncilAbi,
            functionName: "updateVoters",
            args: [
              [
                {
                  account: removeTarget.account as Address,
                  votingPower: BigInt(0),
                  votes: [],
                },
              ],
              maxVotingSpread,
            ],
          },
        },
      ],
      [removeTarget.account],
    );

    setRemoveTarget(null);
  };

  // Show the first/last pages, the current page and its immediate neighbors,
  // with ellipses for the gaps — so a group with hundreds of pages never renders
  // a wall of buttons.
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

  return (
    <Stack direction="vertical" gap={3}>
      <Stack
        direction="horizontal"
        gap={2}
        className="flex-wrap align-items-end"
      >
        <Form.Group style={{ minWidth: 220, flex: "1 1 220px" }}>
          <Form.Label className="fw-semi-bold mb-1">Search address</Form.Label>
          <Form.Control
            type="text"
            placeholder="0x… or paste a list"
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
          />
        </Form.Group>
        <Form.Group style={{ minWidth: 180, flex: "1 1 180px" }}>
          <Form.Label className="fw-semi-bold mb-1">Search name</Form.Label>
          <Form.Control
            type="text"
            placeholder="Profile name"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
          />
        </Form.Group>
        <Form.Group style={{ minWidth: 140 }}>
          <Form.Label className="fw-semi-bold mb-1">% cast</Form.Label>
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

      {moveSuccess ? (
        <Alert variant="success" className="mb-0">
          {moveSuccess}
        </Alert>
      ) : null}
      {removeError ? (
        <Alert variant="danger" className="mb-0">
          {removeError}
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
          {pageVoters.length === 0 ? (
            <tr>
              <td colSpan={isManager ? 5 : 4} className="text-info text-center">
                No voters match.
              </td>
            </tr>
          ) : (
            pageVoters.map((voter) => {
              const account = voter.account.toLowerCase();
              const name = names[account];

              return (
                <tr key={voter.id}>
                  <td>
                    <span className="text-break">
                      {truncateAddress(account)}
                    </span>
                  </td>
                  <td>
                    <span className="fw-semi-bold text-break">
                      {name ? name : truncateAddress(account)}
                    </span>
                  </td>
                  <td className="text-end">{voter.votingPower}</td>
                  <td className="text-end">
                    {computeCastVotes(voter)} / {voter.votingPower}
                  </td>
                  {isManager ? (
                    <td className="text-end">
                      <Dropdown align="end">
                        <Dropdown.Toggle
                          size="sm"
                          variant="outline-secondary"
                          className="fw-semi-bold border-0"
                        >
                          ⋯
                        </Dropdown.Toggle>
                        <Dropdown.Menu className="border-0">
                          <Dropdown.Item
                            disabled={otherGroups.length === 0}
                            onClick={() => openMoveModal(voter)}
                          >
                            Move to group…
                          </Dropdown.Item>
                          <Dropdown.Item
                            className="text-danger"
                            onClick={() => {
                              setRemoveError("");
                              setRemoveTarget(voter);
                            }}
                          >
                            Remove
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      {pageCount > 1 ? (
        <Pagination className="mb-0 flex-wrap">{paginationItems}</Pagination>
      ) : null}

      <Modal show={!!moveTarget} centered onHide={() => setMoveTarget(null)}>
        <Modal.Header closeButton className="border-0 p-4">
          <Modal.Title className="fs-5 fw-semi-bold">Move to group</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-0">
          <p className="text-info">
            Moving a voter changes their group classification only. Their vote
            allocation is unchanged and no transaction is sent.
          </p>
          <Form.Group>
            <Form.Label className="fw-semi-bold">Target group</Form.Label>
            <Form.Select
              value={moveToGroupId}
              disabled={isMoving}
              onChange={(e) => setMoveToGroupId(e.target.value)}
            >
              {otherGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          {moveError ? (
            <Alert variant="danger" className="mt-3 mb-0">
              {moveError}
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <Button
            variant="secondary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => setMoveTarget(null)}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={handleMove}
            disabled={isMoving || !moveToGroupId}
          >
            {isMoving ? <Spinner size="sm" /> : "Move"}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={!!removeTarget}
        centered
        onHide={() => setRemoveTarget(null)}
      >
        <Modal.Header closeButton className="border-0 p-4">
          <Modal.Title className="fs-5 fw-semi-bold">Remove voter</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-0">
          <p className="mb-0">
            Remove{" "}
            <span className="fw-semi-bold text-break">
              {removeTarget ? truncateAddress(removeTarget.account) : ""}
            </span>{" "}
            from this council? This sets their allocation to 0 onchain and drops
            their group classification.
          </p>
          {removeTarget && computeCastVotes(removeTarget) > 0 ? (
            <Alert variant="warning" className="mt-3 mb-0">
              This voter has already cast {computeCastVotes(removeTarget)}{" "}
              vote(s). Removing them caps future votes at 0 but does not retract
              votes already cast.
            </Alert>
          ) : null}
          {removeError ? (
            <Alert variant="danger" className="mt-3 mb-0">
              {removeError}
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <Button
            variant="secondary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => setRemoveTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={handleRemove}
          >
            Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </Stack>
  );
}
