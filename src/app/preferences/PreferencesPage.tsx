"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";

type Preferences = {
  notifyApplicationEligibility: boolean;
  notifyProjectChannels: boolean;
  notifyRoundAnnouncements: boolean;
  notifyInternalReview: boolean;
  notifyPlatform: boolean;
};

type PreferencesResponse = {
  success: true;
  preferences: Preferences;
  emailSuspendedAt: string | null;
  emailSuspensionReason: string | null;
  email: string | null;
  displayName: string | null;
  // POST responses rotate the token (email_version bumps on every
  // mutation). GET responses omit it.
  token?: string;
};

type UnsubscribeResponse = {
  success: true;
  token: string;
};

type ErrorKind = "invalid" | "notfound" | "missing" | "server" | null;

const TOGGLES: { field: keyof Preferences; label: string }[] = [
  {
    field: "notifyApplicationEligibility",
    label: "Application & eligibility updates",
  },
  { field: "notifyProjectChannels", label: "Project channel messages" },
  { field: "notifyRoundAnnouncements", label: "Round announcements" },
  { field: "notifyInternalReview", label: "Internal review comments" },
  { field: "notifyPlatform", label: "Flow State Platform updates" },
];

const ALL_OFF: Preferences = {
  notifyApplicationEligibility: false,
  notifyProjectChannels: false,
  notifyRoundAnnouncements: false,
  notifyInternalReview: false,
  notifyPlatform: false,
};

function redactAddress(address: string): string {
  return `***${address.slice(-4)}`;
}

function redactEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return "***";
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***${domain}`;
}

function redactName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, Math.min(2, trimmed.length))}***`;
}

export default function PreferencesPage() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address");
  // The URL token is only valid until the first mutation (every POST bumps
  // email_version). `currentToken` tracks the rotated token returned by
  // mutations so an open page keeps working; the GET on mount still uses
  // the immutable URL token (it runs before any mutation).
  const urlToken = searchParams.get("token");

  const [currentToken, setCurrentToken] = useState<string | null>(urlToken);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [emailSuspendedAt, setEmailSuspendedAt] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [savingField, setSavingField] = useState<keyof Preferences | null>(
    null,
  );
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [actionError, setActionError] = useState<string>("");

  const fetchPreferences = useCallback(
    async (token: string | null) => {
      if (!address || !token) {
        setErrorKind("missing");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/flow-council/preferences?address=${encodeURIComponent(
            address,
          )}&token=${encodeURIComponent(token)}`,
        );
        if (res.status === 403) {
          setErrorKind("invalid");
          return;
        }
        if (res.status === 404) {
          setErrorKind("notfound");
          return;
        }
        if (!res.ok) {
          setErrorKind("server");
          return;
        }
        const data = (await res.json()) as PreferencesResponse;
        setPreferences(data.preferences);
        setEmailSuspendedAt(data.emailSuspendedAt);
        setEmail(data.email);
        setDisplayName(data.displayName);
        setErrorKind(null);
      } catch (err) {
        console.error(err);
        setErrorKind("server");
      } finally {
        setIsLoading(false);
      }
    },
    [address],
  );

  useEffect(() => {
    fetchPreferences(urlToken);
  }, [fetchPreferences, urlToken]);

  const handleToggle = async (field: keyof Preferences, newValue: boolean) => {
    if (!address || !currentToken || !preferences) return;
    setActionError("");
    setSavingField(field);
    // optimistic update
    const previous = preferences;
    setPreferences({ ...preferences, [field]: newValue });
    try {
      const res = await fetch("/api/flow-council/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: currentToken,
          address,
          preferences: { [field]: newValue },
        }),
      });
      if (!res.ok) {
        setPreferences(previous);
        setActionError("Failed to save preference. Please try again.");
        return;
      }
      const data = (await res.json()) as PreferencesResponse;
      setPreferences(data.preferences);
      setEmailSuspendedAt(data.emailSuspendedAt);
      if (data.token) setCurrentToken(data.token);
    } catch (err) {
      console.error(err);
      setPreferences(previous);
      setActionError("Failed to save preference. Please try again.");
    } finally {
      setSavingField(null);
    }
  };

  const handleUnsubscribeAll = async () => {
    if (!address || !currentToken) return;
    setActionError("");
    setIsUnsubscribing(true);
    try {
      const res = await fetch("/api/flow-council/preferences/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken, address }),
      });
      if (!res.ok) {
        setActionError(
          "Failed to unsubscribe from all notifications. Please try again.",
        );
        return;
      }
      const data = (await res.json()) as UnsubscribeResponse;
      setCurrentToken(data.token);
      setPreferences(ALL_OFF);
      setUnsubscribed(true);
    } catch (err) {
      console.error(err);
      setActionError(
        "Failed to unsubscribe from all notifications. Please try again.",
      );
    } finally {
      setIsUnsubscribing(false);
    }
  };

  // ----- Render branches -----

  if (isLoading || isUnsubscribing) {
    return (
      <Container className="py-5 d-flex justify-content-center">
        <Spinner />
      </Container>
    );
  }

  if (errorKind === "missing") {
    return (
      <Container className="py-5" style={{ maxWidth: 800 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">
          This preferences link is missing required parameters.
        </Alert>
      </Container>
    );
  }

  if (errorKind === "invalid") {
    return (
      <Container className="py-5" style={{ maxWidth: 800 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">
          This preferences link is invalid or has expired. Please request a new
          one.
        </Alert>
      </Container>
    );
  }

  if (errorKind === "notfound") {
    return (
      <Container className="py-5" style={{ maxWidth: 800 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">No profile found for this address.</Alert>
      </Container>
    );
  }

  if (errorKind === "server") {
    return (
      <Container className="py-5" style={{ maxWidth: 800 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">
          Something went wrong. Please try again later.
        </Alert>
      </Container>
    );
  }

  if (!preferences) {
    return (
      <Container className="py-5 d-flex justify-content-center">
        <Spinner />
      </Container>
    );
  }

  const redactedParts = [
    address ? redactAddress(address) : null,
    email ? redactEmail(email) : null,
    displayName ? redactName(displayName) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <Container className="py-5" style={{ maxWidth: 800 }}>
      <h2 className="mb-2">Email Preferences</h2>
      {redactedParts.length > 0 && (
        <p className="text-muted small mb-4">
          Editing preferences for {redactedParts.join(" · ")}
        </p>
      )}

      {unsubscribed && (
        <Alert variant="success">
          You&apos;ve been unsubscribed from all notifications.
        </Alert>
      )}

      {emailSuspendedAt && (
        <Alert variant="warning">
          Your email has been suspended due to delivery problems. Update your
          email in your profile to resume notifications.
        </Alert>
      )}

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <Card className="bg-lace-100 rounded-4 border-0 p-4 mb-4">
        <h5 className="fw-bold mb-3">Notification types</h5>
        <p className="text-muted small mb-3">
          Choose which emails you want to receive from Flow State.
        </p>

        <Stack gap={3}>
          {TOGGLES.map(({ field, label }) => (
            <Form.Check
              key={field}
              type="switch"
              id={`pref-${field}`}
              label={label}
              checked={preferences[field]}
              disabled={savingField === field}
              onChange={(e) => handleToggle(field, e.target.checked)}
            />
          ))}
        </Stack>
      </Card>

      <Button
        variant="outline-danger"
        className="rounded-3 w-100"
        disabled={isUnsubscribing}
        onClick={handleUnsubscribeAll}
      >
        {isUnsubscribing ? <Spinner size="sm" /> : "Unsubscribe from all"}
      </Button>
    </Container>
  );
}
