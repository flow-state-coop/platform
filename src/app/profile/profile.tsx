"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import useSiwe from "@/hooks/siwe";

export default function Profile() {
  const { address } = useAccount();
  const { data: session } = useSession();
  const { openConnectModal } = useConnectModal();
  const { handleSignIn } = useSiwe();
  const hasSession = !!session && session.address === address;
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const addresses = address ? [address] : [];
  const { ensByAddress } = useEnsResolution(addresses);
  const ensName = address ? ensByAddress?.[address.toLowerCase()]?.name : null;

  const fetchProfile = useCallback(async () => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/flow-council/profile?address=${address}`);
      const data = await res.json();

      if (data.success && data.profile) {
        setDisplayName(data.profile.displayName);
        setSavedName(data.profile.displayName);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const res = await fetch("/api/flow-council/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName }),
      });
      const data = await res.json();

      if (data.success) {
        setSavedName(data.profile.displayName);
        setSuccess("Display name saved");
      } else {
        setError(data.error || "Failed to save");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const res = await fetch("/api/flow-council/profile", {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setDisplayName("");
        setSavedName("");
        setSuccess("Display name cleared");
      } else {
        setError(data.error || "Failed to clear");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to clear");
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasSession) {
    return (
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Profile</h2>
        <p className="text-muted mb-3">
          Connect your wallet and sign in to manage your profile.
        </p>
        <Stack gap={3}>
          {!address ? (
            <Button
              variant="primary"
              onClick={() => openConnectModal?.()}
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            >
              Connect Wallet
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4 opacity-25"
            >
              Connect Wallet
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={!address}
            onClick={() => handleSignIn()}
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
          >
            Sign In With Ethereum
          </Button>
        </Stack>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container className="py-5 d-flex justify-content-center">
        <Spinner />
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{ maxWidth: 600 }}>
      <h2 className="mb-4">Profile</h2>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="mb-4">
        <Form.Label className="text-muted small">Wallet Address</Form.Label>
        <p className="font-monospace">{address}</p>
      </div>

      {ensName && (
        <div className="mb-4">
          <Form.Label className="text-muted small">ENS Name</Form.Label>
          <p>{ensName}</p>
        </div>
      )}

      <Form onSubmit={handleSave}>
        <Form.Group className="mb-4">
          <Form.Label>Display Name</Form.Label>
          <Form.Control
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter a display name"
            maxLength={50}
            className="rounded-3"
          />
          <Form.Text className="text-muted">
            Letters, numbers, spaces, hyphens, and underscores. Max 50
            characters.
          </Form.Text>
        </Form.Group>

        <Stack direction="horizontal" gap={2}>
          <Button
            type="submit"
            disabled={
              isSaving || !displayName.trim() || displayName === savedName
            }
            className="rounded-3"
          >
            {isSaving ? <Spinner size="sm" /> : "Save"}
          </Button>
          {savedName && (
            <Button
              variant="outline-secondary"
              onClick={handleClear}
              disabled={isSaving}
              className="rounded-3"
            >
              Clear
            </Button>
          )}
        </Stack>
      </Form>
    </Container>
  );
}
