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
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Link from "next/link";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import useSiwe from "@/hooks/siwe";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";

type ProfileForm = {
  displayName: string;
  bio: string;
  twitter: string;
  github: string;
  linkedin: string;
  farcaster: string;
  email: string;
  telegram: string;
  consentChecked: boolean;
  consentConfirmedAt: string | null;
  notifyApplicationEligibility: boolean;
  notifyProjectChannels: boolean;
  notifyRoundAnnouncements: boolean;
  notifyInternalReview: boolean;
  notifyPlatform: boolean;
  emailSuspendedAt: string | null;
  emailSuspensionReason: string | null;
  savedEmail: string | null;
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
  consentChecked: false,
  consentConfirmedAt: null,
  notifyApplicationEligibility: true,
  notifyProjectChannels: true,
  notifyRoundAnnouncements: true,
  notifyInternalReview: true,
  notifyPlatform: true,
  emailSuspendedAt: null,
  emailSuspensionReason: null,
  savedEmail: null,
};

const SOCIAL_FIELDS: {
  field: "twitter" | "github" | "linkedin" | "farcaster";
  label: string;
  placeholder: string;
}[] = [
  {
    field: "twitter",
    label: "Twitter / X",
    placeholder: "@handle or https://x.com/handle",
  },
  {
    field: "github",
    label: "GitHub",
    placeholder: "username or https://github.com/user",
  },
  {
    field: "linkedin",
    label: "LinkedIn",
    placeholder: "username or https://linkedin.com/in/user",
  },
  {
    field: "farcaster",
    label: "Farcaster",
    placeholder: "@handle or https://farcaster.xyz/handle",
  },
];

const NOTIFICATION_FIELDS: {
  field:
    | "notifyApplicationEligibility"
    | "notifyProjectChannels"
    | "notifyRoundAnnouncements"
    | "notifyInternalReview"
    | "notifyPlatform";
  label: string;
}[] = [
  {
    field: "notifyApplicationEligibility",
    label: "Application & eligibility updates",
  },
  { field: "notifyProjectChannels", label: "Project channel messages" },
  { field: "notifyRoundAnnouncements", label: "Round announcements" },
  { field: "notifyInternalReview", label: "Internal review comments" },
  { field: "notifyPlatform", label: "Flow State Platform updates" },
];

function toProfileForm(
  p: Partial<Record<string, unknown>>,
): ProfileForm {
  const email = (p.email as string) ?? "";
  const consentConfirmedAt = (p.consentConfirmedAt as string | null) ?? null;
  return {
    displayName: (p.displayName as string) ?? "",
    bio: (p.bio as string) ?? "",
    twitter: (p.twitter as string) ?? "",
    github: (p.github as string) ?? "",
    linkedin: (p.linkedin as string) ?? "",
    farcaster: (p.farcaster as string) ?? "",
    email,
    telegram: (p.telegram as string) ?? "",
    consentChecked: consentConfirmedAt !== null,
    consentConfirmedAt,
    notifyApplicationEligibility:
      (p.notifyApplicationEligibility as boolean | undefined) ?? true,
    notifyProjectChannels:
      (p.notifyProjectChannels as boolean | undefined) ?? true,
    notifyRoundAnnouncements:
      (p.notifyRoundAnnouncements as boolean | undefined) ?? true,
    notifyInternalReview:
      (p.notifyInternalReview as boolean | undefined) ?? true,
    notifyPlatform: (p.notifyPlatform as boolean | undefined) ?? true,
    emailSuspendedAt: (p.emailSuspendedAt as string | null) ?? null,
    emailSuspensionReason: (p.emailSuspensionReason as string | null) ?? null,
    savedEmail: email || null,
  };
}

export default function Profile() {
  const { address } = useAccount();
  const { data: session } = useSession();
  const { openConnectModal } = useConnectModal();
  const { handleSignIn } = useSiwe();
  const hasSession = !!session && session.address === address;
  const [form, setForm] = useState<ProfileForm>(INITIAL_PROFILE);
  const [dirty, setDirty] = useState(false);
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
        setForm(toProfileForm(data.profile));
        setDirty(false);
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

    const emailChanged = form.savedEmail !== form.email;
    let consentConfirmedAt: string | null;
    let consentVersion: string | null;
    if (form.consentChecked) {
      if (emailChanged || form.consentConfirmedAt === null) {
        consentConfirmedAt = new Date().toISOString();
      } else {
        consentConfirmedAt = form.consentConfirmedAt;
      }
      consentVersion = CONSENT_VERSION;
    } else {
      consentConfirmedAt = null;
      consentVersion = null;
    }

    const payload = {
      displayName: form.displayName,
      bio: form.bio,
      twitter: form.twitter,
      github: form.github,
      linkedin: form.linkedin,
      farcaster: form.farcaster,
      email: form.email,
      telegram: form.telegram,
      consentConfirmedAt,
      consentVersion,
      notifyApplicationEligibility: form.notifyApplicationEligibility,
      notifyProjectChannels: form.notifyProjectChannels,
      notifyRoundAnnouncements: form.notifyRoundAnnouncements,
      notifyInternalReview: form.notifyInternalReview,
      notifyPlatform: form.notifyPlatform,
    };

    try {
      const res = await fetch("/api/flow-council/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setForm(toProfileForm(data.profile));
        setDirty(false);
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

  const updateField = <K extends keyof ProfileForm>(
    field: K,
    value: ProfileForm[K],
  ) => {
    setForm((prev) => {
      const next: ProfileForm = { ...prev, [field]: value };
      if (field === "email" && value !== prev.savedEmail) {
        next.consentChecked = false;
      }
      return next;
    });
    setDirty(true);
  };

  return (
    <Container className="py-5" style={{ maxWidth: 600 }}>
      <h2 className="mb-4">Profile</h2>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="mb-3">
        <Form.Label className="text-muted small mb-0">
          Wallet Address
        </Form.Label>
        <p className="font-monospace mb-1">{address}</p>
        {ensName && <p className="text-muted small mb-0">{ensName}</p>}
        <Link
          href={`/projects?owner=${address}`}
          className="text-primary small"
        >
          View my projects
        </Link>
      </div>

      <Form onSubmit={handleSave}>
        <Card className="bg-lace-100 rounded-4 border-0 p-4 mb-4">
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

          {SOCIAL_FIELDS.map(({ field, label, placeholder }, i) => (
            <Form.Group
              key={field}
              className={i === SOCIAL_FIELDS.length - 1 ? "mb-0" : "mb-4"}
            >
              <Form.Label>{label}</Form.Label>
              <Form.Control
                type="text"
                value={form[field]}
                onChange={(e) => updateField(field, e.target.value)}
                placeholder={placeholder}
                className="rounded-3"
              />
            </Form.Group>
          ))}
        </Card>

        <Card className="bg-lace-100 rounded-4 border-0 p-4 mb-4">
          <h5 className="fw-bold mb-1">
            Contact Information{" "}
            <Badge bg="secondary" className="ms-2 fw-normal">
              Private
            </Badge>
          </h5>
          <p className="text-muted small mb-3">
            Only shared when you include it in an application. Never visible on
            your public profile.
          </p>

          <Form.Group className="mb-4">
            <Form.Label>Email</Form.Label>
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

          <Form.Group className="mb-0">
            <Form.Label>Telegram</Form.Label>
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
        </Card>

        <Card className="bg-lace-100 rounded-4 border-0 p-4 mb-4">
          <h5 className="fw-bold mb-1">
            Email Notifications{" "}
            <Badge bg="secondary" className="ms-2 fw-normal">
              Private
            </Badge>
          </h5>
          <p className="text-muted small mb-3">
            Choose which emails you want to receive from Flow State.
          </p>

          {form.emailSuspendedAt && (
            <Alert variant="warning" className="rounded-3">
              Your email has been suspended due to delivery problems. Update
              your email to resume notifications.
            </Alert>
          )}

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              id="consent"
              checked={form.consentChecked}
              disabled={!form.email}
              onChange={(e) =>
                updateField("consentChecked", e.target.checked)
              }
              label={CONSENT_TEXT}
            />
            {!form.email && (
              <Form.Text className="text-muted">
                Add an email address above to enable notifications.
              </Form.Text>
            )}
          </Form.Group>

          {form.consentChecked && (
            <Stack gap={2}>
              {NOTIFICATION_FIELDS.map(({ field, label }) => (
                <Form.Check
                  key={field}
                  type="switch"
                  id={`switch-${field}`}
                  checked={form[field]}
                  onChange={(e) => updateField(field, e.target.checked)}
                  label={label}
                />
              ))}
            </Stack>
          )}
        </Card>

        <Button
          type="submit"
          disabled={isSaving || !form.displayName.trim() || !dirty}
          className="rounded-3 w-100"
        >
          {isSaving ? <Spinner size="sm" /> : "Save"}
        </Button>
      </Form>
    </Container>
  );
}
