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

export default function PreferencesPage() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address");
  // The URL token is only valid until the first mutation (every POST bumps
  // email_version). `currentToken` tracks the rotated token returned by
  // mutations so an open page keeps working; the GET on mount still uses
  // the immutable URL token (it runs before any mutation).
  const urlToken = searchParams.get("token");
  const action = searchParams.get("action");
  const isUnsubscribeAction = action === "unsubscribe";

  const [currentToken, setCurrentToken] = useState<string | null>(urlToken);
  const [isLoading, setIsLoading] = useState(!isUnsubscribeAction);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [emailSuspendedAt, setEmailSuspendedAt] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [savingField, setSavingField] = useState<keyof Preferences | null>(
    null,
  );
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [actionError, setActionError] = useState<string>("");

  const fetchPreferences = useCallback(async () => {
    if (!address || !urlToken) {
      setErrorKind("missing");
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/flow-council/preferences?address=${encodeURIComponent(
          address,
        )}&token=${encodeURIComponent(urlToken)}`,
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
      setErrorKind(null);
    } catch (err) {
      console.error(err);
      setErrorKind("server");
    } finally {
      setIsLoading(false);
    }
  }, [address, urlToken]);

  // Unsubscribe-action flow: do NOT auto-POST on mount. Auto-unsubscribing
  // here is the classic RFC 8058 footgun — link prefetchers, scanners and
  // mail-security detonation chambers would silently fire the POST. We only
  // validate params; the actual unsubscribe happens on explicit click of
  // the confirmation button. Native mail-client "Unsubscribe" buttons go to
  // the dedicated one-click endpoint instead (see ses.ts headers).
  useEffect(() => {
    if (!isUnsubscribeAction) return;
    if (!address || !urlToken) {
      setErrorKind("missing");
    }
  }, [isUnsubscribeAction, address, urlToken]);

  // Default flow: fetch preferences on mount.
  useEffect(() => {
    if (isUnsubscribeAction) return;
    fetchPreferences();
  }, [isUnsubscribeAction, fetchPreferences]);

  const confirmUnsubscribe = async () => {
    if (!address || !currentToken) return;
    setActionError("");
    setIsUnsubscribing(true);
    try {
      const res = await fetch("/api/flow-council/preferences/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken, address }),
      });
      if (res.status === 403) {
        setErrorKind("invalid");
        return;
      }
      if (res.status === 404) {
        setErrorKind("notfound");
        return;
      }
      if (!res.ok) {
        setActionError("Failed to unsubscribe. Please try again.");
        return;
      }
      const data = (await res.json()) as UnsubscribeResponse;
      setCurrentToken(data.token);
      setUnsubscribed(true);
      setPreferences(ALL_OFF);
    } catch (err) {
      console.error(err);
      setActionError("Failed to unsubscribe. Please try again.");
    } finally {
      setIsUnsubscribing(false);
    }
  };

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
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">
          This preferences link is missing required parameters.
        </Alert>
      </Container>
    );
  }

  if (errorKind === "invalid") {
    return (
      <Container className="py-5" style={{ maxWidth: 600 }}>
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
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">No profile found for this address.</Alert>
      </Container>
    );
  }

  if (errorKind === "server") {
    return (
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="danger">
          Something went wrong. Please try again later.
        </Alert>
      </Container>
    );
  }

  // Unsubscribe-action: explicit confirmation before any POST (RFC 8058).
  if (isUnsubscribeAction && !unsubscribed) {
    return (
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <h5 className="fw-bold mb-3">Unsubscribe from all notifications?</h5>
          <p className="text-muted mb-4">
            You&apos;ll stop receiving all email notifications from Flow State.
            You can re-enable individual notification types afterwards.
          </p>
          {actionError && (
            <Alert variant="danger" className="mb-3">
              {actionError}
            </Alert>
          )}
          <Button
            variant="danger"
            className="rounded-3"
            onClick={confirmUnsubscribe}
          >
            Confirm unsubscribe
          </Button>
        </Card>
      </Container>
    );
  }

  // Unsubscribe confirmation (before user opts to view details).
  if (isUnsubscribeAction && unsubscribed && !showDetails) {
    return (
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Email Preferences</h2>
        <Alert variant="success">
          You&apos;ve been unsubscribed from all notifications.
        </Alert>
        <Button
          variant="outline-primary"
          className="rounded-3"
          onClick={() => setShowDetails(true)}
        >
          View detailed preferences
        </Button>
      </Container>
    );
  }

  // Detailed preferences view (default flow or after unsubscribe confirmation)
  if (!preferences) {
    return (
      <Container className="py-5 d-flex justify-content-center">
        <Spinner />
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{ maxWidth: 600 }}>
      <h2 className="mb-4">Email Preferences</h2>

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
