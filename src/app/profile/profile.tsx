"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { getCsrfToken, useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Badge from "react-bootstrap/Badge";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import useSiwe from "@/hooks/siwe";

type ProfileForm = {
  displayName: string;
  bio: string;
  twitter: string;
  github: string;
  linkedin: string;
  farcaster: string;
  email: string;
  telegram: string;
};

const INITIAL_PROFILE: ProfileForm = {
  displayName: "",
  bio: "",
  twitter: "",
  github: "",
  linkedin: "",
  farcaster: "",
  email: "",
  telegram: "",
};

export default function Profile() {
  const { address } = useAccount();
  const { data: session } = useSession();
  const { openConnectModal } = useConnectModal();
  const { handleSignIn } = useSiwe();
  const hasSession = !!session && session.address === address;
  const [form, setForm] = useState<ProfileForm>(INITIAL_PROFILE);
  const [savedForm, setSavedForm] = useState<ProfileForm>(INITIAL_PROFILE);
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
      const res = await fetch(
        `/api/flow-council/profile?address=${encodeURIComponent(address)}&includePrivate=true`,
      );
      const data = await res.json();

      if (data.success && data.profile) {
        const p = data.profile;
        const loaded: ProfileForm = {
          displayName: p.displayName ?? "",
          bio: p.bio ?? "",
          twitter: p.twitter ?? "",
          github: p.github ?? "",
          linkedin: p.linkedin ?? "",
          farcaster: p.farcaster ?? "",
          email: p.email ?? "",
          telegram: p.telegram ?? "",
        };
        setForm(loaded);
        setSavedForm(loaded);
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
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (data.success) {
        const p = data.profile;
        const saved: ProfileForm = {
          displayName: p.displayName ?? "",
          bio: p.bio ?? "",
          twitter: p.twitter ?? "",
          github: p.github ?? "",
          linkedin: p.linkedin ?? "",
          farcaster: p.farcaster ?? "",
          email: p.email ?? "",
          telegram: p.telegram ?? "",
        };
        setForm(saved);
        setSavedForm(saved);
        setSuccess("Profile saved");
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
        setForm(INITIAL_PROFILE);
        setSavedForm(INITIAL_PROFILE);
        setSuccess("Profile cleared");
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

  const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm);

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
            onClick={() =>
              getCsrfToken()
                .then((token) => {
                  if (token) handleSignIn(token);
                })
                .catch(console.error)
            }
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

  const updateField = (field: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

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
        <h5 className="fw-bold mb-3">Public Information</h5>

        <Form.Group className="mb-4">
          <Form.Label>Display Name</Form.Label>
          <Form.Control
            type="text"
            value={form.displayName}
            onChange={(e) => updateField("displayName", e.target.value)}
            placeholder="Enter a display name"
            maxLength={50}
            className="rounded-3"
          />
          <Form.Text className="text-muted">
            Letters, numbers, spaces, hyphens, and underscores. Max 50
            characters.
          </Form.Text>
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>Bio / Role</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={form.bio}
            onChange={(e) => updateField("bio", e.target.value)}
            placeholder="Tell others about yourself"
            maxLength={300}
            className="rounded-3"
          />
          <Form.Text className="text-muted">Max 300 characters.</Form.Text>
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>Twitter / X</Form.Label>
          <Form.Control
            type="text"
            value={form.twitter}
            onChange={(e) => updateField("twitter", e.target.value)}
            placeholder="@handle or https://x.com/handle"
            className="rounded-3"
          />
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>GitHub</Form.Label>
          <Form.Control
            type="text"
            value={form.github}
            onChange={(e) => updateField("github", e.target.value)}
            placeholder="username or https://github.com/user"
            className="rounded-3"
          />
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>LinkedIn</Form.Label>
          <Form.Control
            type="text"
            value={form.linkedin}
            onChange={(e) => updateField("linkedin", e.target.value)}
            placeholder="username or https://linkedin.com/in/user"
            className="rounded-3"
          />
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>Farcaster</Form.Label>
          <Form.Control
            type="text"
            value={form.farcaster}
            onChange={(e) => updateField("farcaster", e.target.value)}
            placeholder="@handle or https://warpcast.com/handle"
            className="rounded-3"
          />
        </Form.Group>

        <hr className="my-4" />
        <h5 className="fw-bold mb-3">
          Private Information{" "}
          <Badge bg="secondary" className="ms-2 fw-normal">
            Private
          </Badge>
        </h5>
        <p className="text-muted small mb-3">
          Only shared when you include it in an application. Never visible on
          your public profile.
        </p>

        <Form.Group className="mb-4">
          <Form.Label>
            Email{" "}
            <Badge bg="light" text="dark" className="ms-1 fw-normal">
              Private
            </Badge>
          </Form.Label>
          <Form.Control
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="your@email.com"
            className="rounded-3"
          />
          <Form.Text className="text-muted">
            Auto-fills into applications that ask for an email.
          </Form.Text>
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>
            Telegram{" "}
            <Badge bg="light" text="dark" className="ms-1 fw-normal">
              Private
            </Badge>
          </Form.Label>
          <Form.Control
            type="text"
            value={form.telegram}
            onChange={(e) => updateField("telegram", e.target.value)}
            placeholder="@handle or https://t.me/handle"
            className="rounded-3"
          />
          <Form.Text className="text-muted">
            Auto-fills into applications that ask for Telegram.
          </Form.Text>
        </Form.Group>

        <Stack direction="horizontal" gap={2}>
          <Button
            type="submit"
            disabled={isSaving || !form.displayName.trim() || !hasChanges}
            className="rounded-3"
          >
            {isSaving ? <Spinner size="sm" /> : "Save"}
          </Button>
          {savedForm.displayName && (
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
