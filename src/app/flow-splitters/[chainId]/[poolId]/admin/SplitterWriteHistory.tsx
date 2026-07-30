"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import { getViemChain } from "@/lib/networks";
import { truncateStr } from "@/lib/utils";
import type { Network } from "@/types/network";

type WriteHistoryRow = {
  id: number;
  changedCount: number;
  status: string;
  txHashes: string[];
  gasCostWei: string | null;
  createdAt: string;
  keyLabel: string | null;
};

type SplitterWriteHistoryProps = {
  network: Network;
  poolId: string;
};

const PAGE_SIZE = 10;

// The only statuses ever written to history: a job's queued/running states live
// on the job row, not here.
const STATUS_LABELS: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  no_change: "No change",
};

function formatGasCost(gasCostWei: string, symbol: string) {
  const amount = Number(formatEther(BigInt(gasCostWei)));

  return `${amount < 0.000001 ? amount.toExponential(2) : amount.toFixed(6)} ${symbol}`;
}

export default function SplitterWriteHistory(props: SplitterWriteHistoryProps) {
  const { network, poolId } = props;

  const [writes, setWrites] = useState<WriteHistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const nativeSymbol = getViemChain(network.id).nativeCurrency.symbol;

  const load = useCallback(
    async (cursor: WriteHistoryRow | null) => {
      const id = ++requestId.current;

      setLoading(true);
      setError("");

      // A load from the top is either the first one or a different pool, and
      // leaving the old rows up would credit them to whichever pool is on screen
      // now until the response lands.
      if (!cursor) {
        setWrites([]);
        setHasMore(false);
      }

      // Paged by the last row's id rather than by an offset: this pool can take
      // a write a minute, and an offset would re-render a row the caller has
      // seen.
      const cursorParams = cursor ? `&beforeId=${cursor.id}` : "";

      try {
        const res = await fetch(
          `/api/flow-splitter/history?chainId=${network.id}&poolId=${poolId}&limit=${PAGE_SIZE}${cursorParams}`,
        );
        const data = await res.json();

        if (id !== requestId.current) {
          return;
        }

        if (!data.success) {
          setError(data.error ?? "Failed to load write history");
          return;
        }

        setWrites((prev) => (cursor ? prev.concat(data.writes) : data.writes));
        setHasMore(data.hasMore);
      } catch {
        if (id === requestId.current) {
          setError("Failed to load write history");
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
        }
      }
    },
    [network.id, poolId],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  return (
    <div>
      <span className="fw-semi-bold d-block mb-2">Write history</span>

      {error ? (
        <Alert variant="danger" className={writes.length > 0 ? "mb-3" : "mb-0"}>
          {error}
        </Alert>
      ) : null}

      {loading && writes.length === 0 ? (
        <Stack direction="horizontal" className="justify-content-center py-3">
          <Spinner size="sm" />
        </Stack>
      ) : writes.length === 0 ? (
        // A failed load knows nothing about whether this pool has ever been
        // written, so it must not answer the question the empty state answers.
        error ? null : (
          <p className="text-info mb-0">No API writes yet.</p>
        )
      ) : (
        <>
          <Table responsive hover className="bg-white rounded-4 mb-3">
            <thead>
              <tr>
                <th className="fw-semi-bold">When</th>
                <th className="fw-semi-bold">Key</th>
                <th className="fw-semi-bold text-end">Changed</th>
                <th className="fw-semi-bold">Status</th>
                <th className="fw-semi-bold">Transactions</th>
                <th className="fw-semi-bold text-end">Gas cost</th>
              </tr>
            </thead>
            <tbody>
              {writes.map((write) => (
                <tr key={write.id}>
                  <td>{new Date(write.createdAt).toLocaleString()}</td>
                  <td>
                    {write.keyLabel ?? (
                      <span className="text-info">Deleted key</span>
                    )}
                  </td>
                  <td className="text-end">{write.changedCount}</td>
                  <td
                    className={
                      write.status === "failed"
                        ? "text-danger fw-semi-bold"
                        : ""
                    }
                  >
                    {STATUS_LABELS[write.status] ?? write.status}
                  </td>
                  <td>
                    {write.txHashes.length === 0 ? (
                      <span className="text-info">None</span>
                    ) : (
                      <Stack direction="vertical" gap={1}>
                        {write.txHashes.map((txHash) => (
                          <a
                            key={txHash}
                            href={`${network.blockExplorer}/tx/${txHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <code>{truncateStr(txHash, 14)}</code>
                          </a>
                        ))}
                      </Stack>
                    )}
                  </td>
                  <td className="text-end">
                    {write.gasCostWei ? (
                      formatGasCost(write.gasCostWei, nativeSymbol)
                    ) : (
                      <span className="text-info">N/A</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {hasMore ? (
            <Button
              variant="transparent"
              className="p-0 border-0 text-primary text-decoration-underline fw-semi-bold"
              disabled={loading}
              onClick={() => load(writes[writes.length - 1])}
            >
              {loading ? <Spinner size="sm" /> : "Load more"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
