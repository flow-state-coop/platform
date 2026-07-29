"use client";

import { useState } from "react";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import CopyTooltip from "@/components/CopyTooltip";
import { truncateStr } from "@/lib/utils";
import type { SplitterApiKey } from "./useSplitterApiKeys";

type SplitterApiKeysPanelProps = {
  chainId: number;
  poolId: string;
  keys: SplitterApiKey[];
  loading: boolean;
  loadError: string;
  reload: () => Promise<void>;
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export default function SplitterApiKeysPanel(props: SplitterApiKeysPanelProps) {
  const { chainId, poolId, keys, loading, loadError, reload } = props;

  const [newLabel, setNewLabel] = useState("");
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState("");
  const [mintedToken, setMintedToken] = useState("");

  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState("");

  const handleMint = async () => {
    const label = newLabel.trim();

    if (!label) {
      setMintError("Label is required");
      return;
    }

    setIsMinting(true);
    setMintError("");
    setMintedToken("");

    try {
      const res = await fetch("/api/flow-splitter/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, poolId, label }),
      });
      const data = await res.json();

      if (!data.success) {
        setMintError(data.error ?? "Failed to create key");
        return;
      }

      setMintedToken(data.key.token);
      setNewLabel("");
      await reload();
    } catch {
      setMintError("Failed to create key");
    } finally {
      setIsMinting(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setRevokingId(id);
    setRevokeError("");

    try {
      const res = await fetch(
        `/api/flow-splitter/keys?id=${id}&chainId=${chainId}&poolId=${poolId}`,
        { method: "DELETE" },
      );
      const data = await res.json();

      if (!data.success) {
        setRevokeError(data.error ?? "Failed to revoke key");
        return;
      }

      setConfirmingId(null);
      await reload();
    } catch {
      setRevokeError("Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div>
      <span className="fw-semi-bold d-block mb-2">API keys</span>

      {mintedToken ? (
        <Alert
          variant="success"
          dismissible
          onClose={() => setMintedToken("")}
          // ph-no-capture blocks the whole subtree from session replay, so the
          // token stays out of it even if the markup below is refactored and
          // the `sensitive` text mask stops covering it.
          className="ph-no-capture mb-3"
        >
          <p className="fw-semi-bold mb-1">
            Copy your key now. It won&apos;t be shown again.
          </p>
          <CopyTooltip
            contentClick="Copied"
            contentHover="Copy key"
            target={
              // `sensitive` is what PostHog's session replay masks on (see
              // maskTextSelector in providers.tsx). This page starts session
              // recording, so without it every mint ships a working bearer
              // token into the replay store.
              <code className="sensitive d-block bg-white rounded-4 p-2 text-break text-start">
                {mintedToken}
              </code>
            }
            handleCopy={() => navigator.clipboard.writeText(mintedToken)}
          />
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="danger" className="mb-3">
          {loadError}
        </Alert>
      ) : loading ? (
        <Stack direction="horizontal" className="justify-content-center py-3">
          <Spinner size="sm" />
        </Stack>
      ) : keys.length === 0 ? (
        <p className="text-info mb-3">No API keys yet.</p>
      ) : (
        <Table responsive hover className="bg-white rounded-4 mb-3">
          <thead>
            <tr>
              <th className="fw-semi-bold">Label</th>
              <th className="fw-semi-bold">Key</th>
              <th className="fw-semi-bold">Created by</th>
              <th className="fw-semi-bold">Created</th>
              <th className="fw-semi-bold">Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.label}</td>
                <td>
                  <code>{key.keyPrefix}…</code>
                </td>
                <td>
                  {key.createdBy ? (
                    <code>{truncateStr(key.createdBy, 12)}</code>
                  ) : (
                    "Unknown"
                  )}
                </td>
                <td>{formatDate(key.createdAt)}</td>
                <td>
                  {key.revokedAt ? (
                    <span className="text-danger fw-semi-bold">Revoked</span>
                  ) : (
                    formatDate(key.lastUsedAt)
                  )}
                </td>
                <td className="text-end">
                  {key.revokedAt ? null : confirmingId === key.id ? (
                    <Stack
                      direction="horizontal"
                      gap={2}
                      className="justify-content-end"
                    >
                      <Button
                        size="sm"
                        variant="danger"
                        className="fw-semi-bold rounded-4"
                        disabled={revokingId === key.id}
                        onClick={() => handleRevoke(key.id)}
                      >
                        {revokingId === key.id ? (
                          <Spinner size="sm" />
                        ) : (
                          "Confirm"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        className="fw-semi-bold text-decoration-none p-0"
                        disabled={revokingId === key.id}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="fw-semi-bold rounded-4"
                      onClick={() => setConfirmingId(key.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {revokeError ? (
        <Alert variant="danger" className="mb-3">
          {revokeError}
        </Alert>
      ) : null}

      <Form.Label htmlFor="splitter-api-key-label" className="fw-semi-bold">
        Key label
      </Form.Label>
      <Stack direction="horizontal" gap={2} className="align-items-start">
        <Form.Control
          id="splitter-api-key-label"
          type="text"
          placeholder="e.g. Social Metrics"
          value={newLabel}
          maxLength={100}
          disabled={isMinting}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <Button
          className="fw-semi-bold flex-shrink-0 rounded-4"
          disabled={isMinting}
          onClick={handleMint}
        >
          {isMinting ? <Spinner size="sm" /> : "Create key"}
        </Button>
      </Stack>

      {mintError ? (
        <Alert variant="danger" className="mt-2 mb-0">
          {mintError}
        </Alert>
      ) : null}
    </div>
  );
}
