"use client";

import { useState, useEffect, useCallback } from "react";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import CopyTooltip from "@/components/CopyTooltip";

type ApiKey = {
  id: number;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type MetricsApiKeysPanelProps = {
  chainId: number;
  councilId: string;
  isManager: boolean;
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export default function MetricsApiKeysPanel(props: MetricsApiKeysPanelProps) {
  const { chainId, councilId, isManager } = props;

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState("");
  const [mintedToken, setMintedToken] = useState("");

  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState("");

  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const ballotEndpoint = `${origin}/api/flow-council/metrics/ballot`;

  const loadKeys = useCallback(async () => {
    // Listing keys requires a council manager; non-managers would only get a 403,
    // so skip the fetch and leave the panel showing the endpoint alone.
    if (!isManager) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch(
        `/api/flow-council/metrics/keys?chainId=${chainId}&councilId=${councilId}`,
      );
      const data = await res.json();

      if (!data.success) {
        setLoadError(data.error ?? "Failed to load API keys");
        return;
      }

      setKeys(data.keys);
    } catch {
      setLoadError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [chainId, councilId, isManager]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

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
      const res = await fetch("/api/flow-council/metrics/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, councilId, label }),
      });
      const data = await res.json();

      if (!data.success) {
        setMintError(data.error ?? "Failed to create key");
        return;
      }

      setMintedToken(data.key.token);
      setNewLabel("");
      await loadKeys();
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
        `/api/flow-council/metrics/keys?id=${id}&chainId=${chainId}&councilId=${councilId}`,
        { method: "DELETE" },
      );
      const data = await res.json();

      if (!data.success) {
        setRevokeError(data.error ?? "Failed to revoke key");
        return;
      }

      setConfirmingId(null);
      await loadKeys();
    } catch {
      setRevokeError("Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div>
      <span className="fw-semi-bold d-block mb-2">Metrics API</span>
      <p className="text-info mb-2">
        Push ballots as the metrics bot by POSTing relative weights to:
      </p>
      <code className="d-block bg-white rounded-4 p-2 mb-3 text-break">
        POST {ballotEndpoint}
      </code>

      {mintedToken ? (
        <Alert
          variant="success"
          dismissible
          onClose={() => setMintedToken("")}
          className="mb-3"
        >
          <p className="fw-semi-bold mb-1">
            Copy your key now — it won&apos;t be shown again.
          </p>
          <CopyTooltip
            contentClick="Copied"
            contentHover="Copy key"
            target={
              <code className="d-block bg-white rounded-4 p-2 text-break text-start">
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
      ) : null}

      {loading ? (
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
              <th className="fw-semi-bold">Last used</th>
              {isManager ? <th /> : null}
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
                  {key.revokedAt ? (
                    <span className="text-danger fw-semi-bold">Revoked</span>
                  ) : (
                    formatDate(key.lastUsedAt)
                  )}
                </td>
                {isManager ? (
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
                ) : null}
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

      {isManager ? (
        <div>
          <Form.Label className="fw-semi-bold">Key label</Form.Label>
          <Stack direction="horizontal" gap={2} className="align-items-start">
            <Form.Control
              type="text"
              placeholder="e.g. Dune pipeline"
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
        </div>
      ) : null}

      {mintError ? (
        <Alert variant="danger" className="mt-2 mb-0">
          {mintError}
        </Alert>
      ) : null}
    </div>
  );
}
