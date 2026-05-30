"use client";

import { useState, useMemo } from "react";
import { Address } from "viem";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import {
  CHUNK_SIZE,
  splitIntoChunks,
} from "@/app/flow-councils/hooks/useChunkedTxQueue";
import {
  computeCastVotes,
  computeNewVotingPower,
  wouldReduceBelowCast,
} from "@/app/flow-councils/lib/voterUtils";

type SubgraphVoter = {
  id: string;
  account: string;
  votingPower: string;
  ballot?: { votes?: { amount: string }[] };
};

type ChunkedQueue = {
  startQueue: (councilId: string, chunks: { args: Record<string, unknown> }[]) => void;
  pause: () => void;
  resume: () => void;
  isPending: boolean;
  isPaused: boolean;
  completedCount: number;
  totalCount: number;
};

type BulkActionToolbarProps = {
  chainId: number;
  councilId: string;
  allGroupVoters: SubgraphVoter[];
  filteredVoters: SubgraphVoter[];
  isManager: boolean;
  q: ChunkedQueue;
  maxVotingSpread: number;
  onRefresh: () => Promise<void> | void;
};

type Mode = "set" | "increment";

export default function BulkActionToolbar(props: BulkActionToolbarProps) {
  const {
    chainId,
    councilId,
    allGroupVoters,
    filteredVoters,
    isManager,
    q,
    maxVotingSpread,
    onRefresh,
  } = props;

  const [value, setValue] = useState("");
  const [mode, setMode] = useState<Mode>("set");
  const [pendingTargets, setPendingTargets] = useState<SubgraphVoter[] | null>(
    null,
  );
  const [pendingRemove, setPendingRemove] = useState<SubgraphVoter[] | null>(
    null,
  );

  const numericValue = Number(value);
  const valueValid =
    value !== "" && /^\d+$/.test(value) && Number(value) <= 1e6;

  // Build the updateVoters chunks for a set of target voters and enqueue them.
  // maxVotingSpread is passed verbatim on EVERY chunk so a paused/failed queue
  // never resets the council's spread to "no limit".
  const enqueue = (targets: SubgraphVoter[]) => {
    if (!valueValid || targets.length === 0) {
      return;
    }

    const entries = targets.map((voter) => ({
      account: voter.account as Address,
      votingPower: BigInt(
        computeNewVotingPower(Number(voter.votingPower), numericValue, mode),
      ),
      votes: [] as [],
    }));

    const chunks = splitIntoChunks(entries, CHUNK_SIZE).map((slice) => ({
      args: {
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateVoters",
        args: [slice, maxVotingSpread],
      },
    }));

    q.startQueue(councilId, chunks);
  };

  // True when any target voter has already cast votes (mid-round) or applying
  // the new power would drop them below their cast — both warrant a confirm.
  const needsWarning = (targets: SubgraphVoter[]): boolean => {
    if (!valueValid) {
      return false;
    }

    return targets.some((voter) => {
      const cast = computeCastVotes(voter);
      const newPower = computeNewVotingPower(
        Number(voter.votingPower),
        numericValue,
        mode,
      );

      return cast > 0 || wouldReduceBelowCast(newPower, cast);
    });
  };

  const apply = (targets: SubgraphVoter[]) => {
    if (needsWarning(targets)) {
      setPendingTargets(targets);
      return;
    }

    enqueue(targets);
  };

  const confirmPending = () => {
    if (pendingTargets) {
      enqueue(pendingTargets);
    }

    setPendingTargets(null);
  };

  // Bulk removal: set votingPower to 0 onchain via updateVoters (the batchable
  // primitive — the same path as a single-row remove, just many entries chunked
  // 50/tx), then drop the DB classification rows in one batch DELETE. An empty
  // group can then be deleted. maxVotingSpread is preserved on every chunk.
  const enqueueRemove = (targets: SubgraphVoter[]) => {
    if (targets.length === 0) {
      return;
    }

    const entries = targets.map((voter) => ({
      account: voter.account as Address,
      votingPower: BigInt(0),
      votes: [] as [],
    }));

    const chunks = splitIntoChunks(entries, CHUNK_SIZE).map((slice) => ({
      args: {
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateVoters",
        args: [slice, maxVotingSpread],
      },
    }));

    q.startQueue(councilId, chunks);

    void fetch("/api/flow-council/voter-groups/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId,
        councilId,
        addresses: targets.map((v) => v.account),
      }),
    }).then(() => onRefresh());
  };

  const confirmRemove = () => {
    if (pendingRemove) {
      enqueueRemove(pendingRemove);
    }

    setPendingRemove(null);
  };

  const removeWarningCount = useMemo(() => {
    if (!pendingRemove) {
      return 0;
    }

    return pendingRemove.filter((voter) => computeCastVotes(voter) > 0).length;
  }, [pendingRemove]);

  const submittedCount = q.completedCount + (q.isPending ? 1 : 0);
  const progressPct =
    q.totalCount > 0 ? Math.min(100, (submittedCount / q.totalCount) * 100) : 0;
  const showProgress = q.isPending || q.totalCount > 0;

  const warningCount = useMemo(() => {
    if (!pendingTargets) {
      return 0;
    }

    return pendingTargets.filter((voter) => computeCastVotes(voter) > 0).length;
  }, [pendingTargets]);

  if (!isManager) {
    return null;
  }

  return (
    <Stack direction="vertical" gap={3} className="mb-4">
      <Stack
        direction="horizontal"
        gap={3}
        className="flex-wrap align-items-end"
      >
        <Form.Group style={{ minWidth: 160 }}>
          <Form.Label className="fw-semi-bold mb-1">Votes</Form.Label>
          <Form.Control
            type="text"
            inputMode="numeric"
            placeholder="e.g. 10"
            value={value}
            onChange={(e) => {
              const v = e.target.value;

              if (v === "" || (/^\d+$/.test(v) && Number(v) <= 1e6)) {
                setValue(v);
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
              checked={mode === "set"}
              onChange={() => setMode("set")}
            />
            <Form.Check
              type="radio"
              id="bulk-mode-increment"
              name="bulk-mode"
              label="Increment"
              checked={mode === "increment"}
              onChange={() => setMode("increment")}
            />
          </Stack>
        </Form.Group>
        <span className="text-info">
          {mode === "set"
            ? `Set each to ${valueValid ? numericValue : "N"}`
            : `Add ${valueValid ? numericValue : "N"} to each`}
        </span>
      </Stack>

      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button
          className="rounded-4 px-4 py-2 fw-semi-bold"
          disabled={!valueValid || allGroupVoters.length === 0 || q.isPending}
          onClick={() => apply(allGroupVoters)}
        >
          Apply All ({allGroupVoters.length})
        </Button>
        <Button
          variant="outline-primary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          disabled={
            !valueValid ||
            filteredVoters.length === 0 ||
            q.isPending
          }
          onClick={() => apply(filteredVoters)}
        >
          Apply to filtered ({filteredVoters.length})
        </Button>
        <Button
          variant="outline-danger"
          className="rounded-4 px-4 py-2 fw-semi-bold ms-auto"
          disabled={filteredVoters.length === 0 || q.isPending}
          onClick={() => setPendingRemove(filteredVoters)}
          title="Removes the currently filtered voters onchain (votingPower → 0) and from this group. Clear filters to remove the whole group."
        >
          Remove filtered ({filteredVoters.length})
        </Button>
      </Stack>

      {showProgress ? (
        <Stack direction="vertical" gap={1}>
          <Stack
            direction="horizontal"
            gap={2}
            className="flex-wrap align-items-center"
          >
            <span className="text-info fw-semi-bold">
              Submitting {Math.min(submittedCount, q.totalCount)} of{" "}
              {q.totalCount}…
            </span>
            {q.isPending ? (
              <Button
                size="sm"
                variant="outline-secondary"
                className="fw-semi-bold"
                onClick={() => q.pause()}
              >
                Pause
              </Button>
            ) : null}
            {q.isPaused &&
            q.totalCount > 0 &&
            q.completedCount < q.totalCount &&
            !q.isPending ? (
              <Button
                size="sm"
                className="fw-semi-bold"
                onClick={() => q.resume()}
              >
                Resume
              </Button>
            ) : null}
          </Stack>
          <ProgressBar now={progressPct} />
        </Stack>
      ) : null}

      <Modal
        show={!!pendingTargets}
        centered
        onHide={() => setPendingTargets(null)}
      >
        <Modal.Header closeButton className="border-0 p-4">
          <Modal.Title className="fs-5 fw-semi-bold">
            Confirm bulk change
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-0">
          <Alert variant="warning" className="mb-0">
            {warningCount} voter(s) have already cast. Reducing below cast caps
            future votes but does not remove cast votes. Continue?
          </Alert>
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <Button
            variant="secondary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => setPendingTargets(null)}
          >
            Cancel
          </Button>
          <Button
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={confirmPending}
          >
            Continue
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={!!pendingRemove}
        centered
        onHide={() => setPendingRemove(null)}
      >
        <Modal.Header closeButton className="border-0 p-4">
          <Modal.Title className="fs-5 fw-semi-bold">
            Remove voters
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-0">
          <p className="mb-0">
            Remove{" "}
            <span className="fw-semi-bold">
              {pendingRemove?.length ?? 0}
            </span>{" "}
            voter(s)? This sets their allocation to 0 onchain (in batched
            transactions) and drops their group classification.
          </p>
          {removeWarningCount > 0 ? (
            <Alert variant="warning" className="mt-3 mb-0">
              {removeWarningCount} of them have already cast votes. Removal caps
              their future votes at 0 but does not retract votes already cast.
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <Button
            variant="secondary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => setPendingRemove(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={confirmRemove}
          >
            Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </Stack>
  );
}
