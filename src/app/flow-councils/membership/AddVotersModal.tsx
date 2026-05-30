"use client";

import { useState, useMemo } from "react";
import { Address, isAddress } from "viem";
import Papa from "papaparse";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { isNumber } from "@/lib/utils";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import {
  CHUNK_SIZE,
  splitIntoChunks,
} from "@/app/flow-councils/hooks/useChunkedTxQueue";

type ChunkedQueue = {
  startQueue: (
    councilId: string,
    chunks: { args: Record<string, unknown> }[],
  ) => void;
};

type AddVotersModalProps = {
  show: boolean;
  onHide: () => void;
  chainId: number;
  councilId: string;
  groupId: number;
  defaultVotingPower: number;
  existingOnchainAccounts: string[];
  q: ChunkedQueue;
  maxVotingSpread: number;
  onRefresh: () => Promise<void> | void;
};

type ParsedRow = {
  address: string;
  votingPower: number;
  error: string;
};

// Parse the textarea (newline/comma separated addresses). Each row inherits the
// group default; CSV upload can override per-row via a second column.
function parseTextarea(raw: string, defaultPower: number): ParsedRow[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((address) => ({
      address,
      votingPower: defaultPower,
      error: isAddress(address) ? "" : "Invalid address",
    }));
}

export default function AddVotersModal(props: AddVotersModalProps) {
  const {
    show,
    onHide,
    chainId,
    councilId,
    groupId,
    defaultVotingPower,
    existingOnchainAccounts,
    q,
    maxVotingSpread,
    onRefresh,
  } = props;

  const [text, setText] = useState("");
  const [csvRows, setCsvRows] = useState<ParsedRow[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const existingSet = useMemo(
    () => new Set(existingOnchainAccounts.map((a) => a.toLowerCase())),
    [existingOnchainAccounts],
  );

  // CSV rows take precedence over the textarea once a file is uploaded.
  const parsedRows = useMemo<ParsedRow[]>(() => {
    if (csvRows) {
      return csvRows;
    }

    return parseTextarea(text, defaultVotingPower);
  }, [csvRows, text, defaultVotingPower]);

  const invalidRows = parsedRows.filter((r) => r.error);

  // Dedupe valid rows, then split into rows that are already voters (skip) and
  // rows to actually add.
  const { toAdd, skipped } = useMemo(() => {
    const seen = new Set<string>();
    const toAddRows: ParsedRow[] = [];
    const skippedRows: ParsedRow[] = [];

    for (const row of parsedRows) {
      if (row.error) {
        continue;
      }

      const addr = row.address.toLowerCase();

      if (seen.has(addr)) {
        continue;
      }

      seen.add(addr);

      if (existingSet.has(addr)) {
        skippedRows.push(row);
      } else {
        toAddRows.push(row);
      }
    }

    return { toAdd: toAddRows, skipped: skippedRows };
  }, [parsedRows, existingSet]);

  const reset = () => {
    setText("");
    setCsvRows(null);
    setSubmitError("");
  };

  const close = () => {
    reset();
    onHide();
  };

  const handleCsv = (file: File) => {
    Papa.parse(file, {
      complete: (results: { data: string[][] }) => {
        const rows: ParsedRow[] = [];

        for (const row of results.data) {
          if (!row[0]) {
            continue;
          }

          const address = row[0].trim();
          const rawPower = (row[1] ?? "").trim();
          // A row's power is a valid override only when it's a positive integer.
          // An out-of-range value (> 1M) is treated as an invalid row rather
          // than silently sending a huge BigInt onchain. A missing/invalid power
          // simply falls back to the group default.
          const isPositiveInteger =
            isNumber(rawPower) &&
            !rawPower.includes(".") &&
            Number(rawPower) > 0;
          const powerTooLarge = isPositiveInteger && Number(rawPower) > 1e6;
          const power = isPositiveInteger
            ? Number(rawPower)
            : defaultVotingPower;

          rows.push({
            address,
            votingPower: power,
            error: !isAddress(address)
              ? "Invalid address"
              : powerTooLarge
                ? "Votes must be ≤ 1M"
                : "",
          });
        }

        setCsvRows(rows);
      },
    });
  };

  const handleAdd = async () => {
    if (toAdd.length === 0) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError("");

      // Offchain: classify every new address into this group (DB) in a SINGLE
      // batched request, before enqueuing the onchain allocation. Bail out if
      // the DB write fails (auth expired, group deleted, cap exceeded, …) so we
      // never enqueue onchain allocations for voters with no group membership.
      const res = await fetch("/api/flow-council/voter-groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          councilId,
          groupId,
          addresses: toAdd.map((row) => row.address),
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setSubmitError(data?.error ?? "Failed to add voters");
        return;
      }

      // Onchain: set each new voter's allocation via the chunked queue. Pass the
      // council's CURRENT maxVotingSpread verbatim on every chunk.
      const entries = toAdd.map((row) => ({
        account: row.address as Address,
        votingPower: BigInt(row.votingPower),
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

      await onRefresh();
      close();
    } catch (err) {
      console.error(err);
      setSubmitError("Failed to add voters");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal show={show} centered size="lg" onHide={close}>
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">Add voters</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4 pt-0">
        <Form.Group className="mb-3">
          <Form.Label className="fw-semi-bold">Addresses</Form.Label>
          <Form.Control
            as="textarea"
            rows={5}
            placeholder="0x… (one per line, or comma-separated)"
            value={text}
            disabled={isSubmitting || !!csvRows}
            onChange={(e) => setText(e.target.value)}
          />
          <Form.Text className="text-info">
            Each voter receives the group default of {defaultVotingPower} votes
            unless a CSV row overrides it.
          </Form.Text>
        </Form.Group>

        <Stack direction="horizontal" gap={3} className="mb-3 flex-wrap">
          <Form.Label
            htmlFor="add-voters-csv"
            className="bg-primary text-white text-center m-0 px-4 py-2 rounded-4 cursor-pointer fw-semi-bold"
          >
            Upload CSV
          </Form.Label>
          <Form.Control
            type="file"
            id="add-voters-csv"
            accept=".csv"
            hidden
            disabled={isSubmitting}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.files && e.target.files[0]) {
                handleCsv(e.target.files[0]);
              }
            }}
          />
          {csvRows ? (
            <Button
              variant="outline-secondary"
              size="sm"
              className="fw-semi-bold"
              disabled={isSubmitting}
              onClick={() => setCsvRows(null)}
            >
              Clear CSV
            </Button>
          ) : null}
          <span className="text-info small align-self-center">
            CSV format: address,votingPower (power optional)
          </span>
        </Stack>

        {invalidRows.length > 0 ? (
          <Alert variant="danger">
            <span className="fw-semi-bold">
              {invalidRows.length} invalid address(es):
            </span>
            <ul className="mb-0 mt-1">
              {invalidRows.slice(0, 10).map((row, i) => (
                <li key={i} className="text-break">
                  {row.address || "(empty)"} — {row.error}
                </li>
              ))}
            </ul>
            {invalidRows.length > 10 ? (
              <span className="small">…and {invalidRows.length - 10} more</span>
            ) : null}
          </Alert>
        ) : null}

        {skipped.length > 0 ? (
          <Alert variant="info">
            {skipped.length} address(es) are already voters on this council —
            skipped.
          </Alert>
        ) : null}

        {submitError ? (
          <Alert variant="danger" className="mb-0">
            {submitError}
          </Alert>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <span className="text-info me-auto">
          {toAdd.length} to add
          {skipped.length > 0 ? `, ${skipped.length} skipped` : ""}
        </span>
        <Button
          variant="secondary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={close}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={handleAdd}
          disabled={
            isSubmitting || toAdd.length === 0 || invalidRows.length > 0
          }
        >
          {isSubmitting ? <Spinner size="sm" /> : `Add ${toAdd.length}`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
