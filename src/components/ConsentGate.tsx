"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal, Button, Form } from "react-bootstrap";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import { isValidEmail } from "@/lib/email";

// Shape of the profile returned by GET /api/flow-council/profile?includePrivate=true
// for the authenticated owner. `emailVersion` is intentionally excluded server-side
// (internal-only). `createdAt`/`updatedAt` are not returned by this endpoint.
type ProfileShape = {
  address: string;
  // NOT NULL in DB and validated with min(1) server-side — never null in practice.
  displayName: string;
  bio: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  farcaster: string | null;
  email: string | null;
  telegram: string | null;
  consentConfirmedAt: string | null;
  consentVersion: string | null;
  notifyApplicationEligibility: boolean;
  notifyProjectChannels: boolean;
  notifyRoundAnnouncements: boolean;
  notifyInternalReview: boolean;
  notifyPlatform: boolean;
  emailSuspendedAt: string | null;
  emailSuspensionReason: string | null;
};

const DISMISS_KEY_PREFIX = "consent-modal-dismissed-at-";

export default function ConsentGate() {
  const { data: session, status } = useSession();

  const [show, setShow] = useState(false);
  const [profile, setProfile] = useState<ProfileShape | null>(null);
  const [email, setEmail] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [notifyApplicationEligibility, setNotifyApplicationEligibility] =
    useState(true);
  const [notifyProjectChannels, setNotifyProjectChannels] = useState(true);
  const [notifyRoundAnnouncements, setNotifyRoundAnnouncements] =
    useState(true);
  const [notifyInternalReview, setNotifyInternalReview] = useState(true);
  const [notifyPlatform, setNotifyPlatform] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.address) {
      return;
    }

    const address = session.address.toLowerCase();

    // UX-only gate: sessionStorage suppresses the modal after "Not now"
    // for the current browser session only. Closing the tab/browser
    // re-prompts on next sign-in, matching the spec's "until they dismiss
    // + return" requirement. The authoritative gate remains server-side
    // (`consent_confirmed_at IS NOT NULL` in the dispatch pipeline) — do
    // not remove the server check thinking this is sufficient.
    const dismissedAt = sessionStorage.getItem(
      `${DISMISS_KEY_PREFIX}${address}`,
    );
    if (dismissedAt) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/profile?address=${address}&includePrivate=true`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          success: boolean;
          profile: ProfileShape | null;
        };
        if (cancelled || !json.success || !json.profile) return;

        const p = json.profile;

        // Prompt whenever consent hasn't been recorded yet. If the user has
        // no email on file, the modal collects it inline; otherwise the
        // field is pre-filled and editable.
        if (p.consentConfirmedAt === null) {
          setProfile(p);
          setEmail(p.email ?? "");
          setShow(true);
        }
      } catch {
        // Silent — nothing useful we can show before the modal is open.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.address]);

  const handleNotNow = () => {
    if (session?.address) {
      sessionStorage.setItem(
        `${DISMISS_KEY_PREFIX}${session.address.toLowerCase()}`,
        new Date().toISOString(),
      );
    }
    setShow(false);
  };

  const handleSave = async () => {
    if (!profile || !consentChecked) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // PUT is a full upsert — pass existing identity/social fields through
      // unchanged so they aren't cleared. Server-managed fields (`address`,
      // `emailSuspendedAt`, `emailSuspensionReason`) are not sent. The Zod
      // schema rejects null for string fields, so empty/missing values are
      // sent as "" rather than null.
      const body = {
        displayName: profile.displayName,
        bio: profile.bio ?? "",
        twitter: profile.twitter ?? "",
        github: profile.github ?? "",
        linkedin: profile.linkedin ?? "",
        farcaster: profile.farcaster ?? "",
        email: trimmedEmail,
        telegram: profile.telegram ?? "",
        consentConfirmedAt: new Date().toISOString(),
        consentVersion: CONSENT_VERSION,
        notifyApplicationEligibility,
        notifyProjectChannels,
        notifyRoundAnnouncements,
        notifyInternalReview,
        notifyPlatform,
      };

      const res = await fetch("/api/flow-council/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !json?.success) {
        setError(
          json?.error || "Could not save preferences. Please try again.",
        );
        return;
      }

      // Consent is now recorded server-side, so clear any prior "Not now"
      // suppression flag. Leaving it would silently swallow a future
      // re-prompt (e.g. on a consent-version bump).
      if (session?.address) {
        sessionStorage.removeItem(
          `${DISMISS_KEY_PREFIX}${session.address.toLowerCase()}`,
        );
      }

      setShow(false);
    } catch {
      setError("Could not save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <Modal show={show} backdrop="static" keyboard={false} centered>
      <Modal.Header className="px-4 pt-4 pb-2 border-0">
        <Modal.Title>Email notification preferences</Modal.Title>
      </Modal.Header>
      <Modal.Body className="px-4 py-3">
        <p>
          We&apos;ve updated how email notifications work. Please confirm your
          email and choose what you want to hear about.
        </p>
        <Form.Group className="mb-3" controlId="consent-modal-email">
          <Form.Label>Email address</Form.Label>
          <Form.Control
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            required
          />
        </Form.Group>
        <Form.Check
          type="checkbox"
          id="consent-modal-checkbox"
          label={CONSENT_TEXT}
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
        />
        <div className="mt-3">
          <p className="text-muted small mb-2">
            Choose what you&apos;d like to hear about:
          </p>
          <Form.Switch
            id="consent-modal-notify-application-eligibility"
            label="Application & eligibility updates"
            checked={notifyApplicationEligibility}
            disabled={!consentChecked}
            onChange={(e) => setNotifyApplicationEligibility(e.target.checked)}
          />
          <Form.Switch
            id="consent-modal-notify-project-channels"
            label="Project channel messages"
            checked={notifyProjectChannels}
            disabled={!consentChecked}
            onChange={(e) => setNotifyProjectChannels(e.target.checked)}
          />
          <Form.Switch
            id="consent-modal-notify-round-announcements"
            label="Round announcements"
            checked={notifyRoundAnnouncements}
            disabled={!consentChecked}
            onChange={(e) => setNotifyRoundAnnouncements(e.target.checked)}
          />
          <Form.Switch
            id="consent-modal-notify-internal-review"
            label="Internal review comments"
            checked={notifyInternalReview}
            disabled={!consentChecked}
            onChange={(e) => setNotifyInternalReview(e.target.checked)}
          />
          <Form.Switch
            id="consent-modal-notify-platform"
            label="Flow State Platform updates"
            checked={notifyPlatform}
            disabled={!consentChecked}
            onChange={(e) => setNotifyPlatform(e.target.checked)}
          />
        </div>
        {error && (
          <div className="text-danger mt-3" role="alert">
            {error}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="px-4 pb-4 pt-2 border-0">
        <Button variant="link" onClick={handleNotNow} disabled={saving}>
          Not now
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!consentChecked || saving}
        >
          {saving ? "Saving..." : "Save preferences"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
