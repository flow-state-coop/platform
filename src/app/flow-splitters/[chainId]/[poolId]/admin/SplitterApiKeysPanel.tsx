"use client";

import { useState } from "react";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import { truncateStr } from "@/lib/utils";
import type { SplitterApiKey } from "./useSplitterApiKeys";

type SplitterApiKeysPanelProps = {
  chainId: number;
  poolId: string;
  keys: SplitterApiKey[];
  loading: boolean;
  loadError: string;
  // The token is shown once, above this panel, because it has to outlive it.
  // Only ever called with a token: a mint that fails must not take down the
  // previous one, which may not have been copied yet and cannot be recovered.
  onMinted: (token: string) => void;
  reload: () => Promise<void>;
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export default function SplitterApiKeysPanel(props: SplitterApiKeysPanelProps) {
  const { chainId, poolId, keys, loading, loadError, onMinted, reload } = props;

  const [newLabel, setNewLabel] = useState("");
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState("");

  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState("");

  // Revoked keys accumulate for as long as the pool rotates against the
  // active-key cap, so only the freshest few stay visible. Active keys always
  // show; the server orders by id, so the slice is the most recent.
  const activeKeys = keys.filter((key) => !key.revokedAt);
  const revokedKeys = keys.filter((key) => key.revokedAt);
  const shownKeys = activeKeys.concat(revokedKeys.slice(-5));
  const hiddenRevoked = revokedKeys.length - Math.min(revokedKeys.length, 5);

  const handleMint = async () => {
    const label = newLabel.trim();

    if (!label) {
      setMintError("Label is required");
      return;
    }

    setIsMinting(true);
    setMintError("");

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

      onMinted(data.key.token);
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
            {shownKeys.map((key) => (
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
                        onClick={() => {
                          setConfirmingId(null);
                          setRevokeError("");
                        }}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="fw-semi-bold rounded-4"
                      onClick={() => {
                        setConfirmingId(key.id);
                        setRevokeError("");
                      }}
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

      {hiddenRevoked > 0 ? (
        <p className="text-info mb-3">
          And {hiddenRevoked} older revoked{" "}
          {hiddenRevoked === 1 ? "key" : "keys"}.
        </p>
      ) : null}

      {revokeError ? (
        <Alert variant="danger" className="mb-3">
          {revokeError}
        </Alert>
      ) : null}

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          handleMint();
        }}
      >
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
            type="submit"
            className="fw-semi-bold flex-shrink-0 rounded-4"
            disabled={isMinting}
          >
            {isMinting ? <Spinner size="sm" /> : "Create key"}
          </Button>
        </Stack>
      </Form>

      {mintError ? (
        <Alert variant="danger" className="mt-2 mb-0">
          {mintError}
        </Alert>
      ) : null}
    </div>
  );
}
