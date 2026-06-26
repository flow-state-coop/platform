"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal, Button, Form } from "react-bootstrap";
import Link from "next/link";
import { CONSENT_VERSION } from "@/lib/consent";
import { isValidEmail } from "@/lib/email";
import { useNotificationGate } from "@/context/NotificationGate";
import EmailNotificationPreferences, {
  type NotificationToggles,
} from "@/components/EmailNotificationPreferences";

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

type GateRole = "applicant" | "admin" | null;

const DISMISS_KEY_PREFIX = "consent-modal-dismissed-at-";

const DEFAULT_TOGGLES: NotificationToggles = {
  notifyApplicationEligibility: true,
  notifyProjectChannels: true,
  notifyRoundAnnouncements: true,
  notifyInternalReview: true,
  notifyPlatform: true,
};

// Copy is tailored to why the wallet is being prompted. Applicants and admins
// get a reason tied to their round; everyone else gets the generic v2 migration
// nudge. The "here" link points at the profile page for later edits.
function GateMessage({ role }: { role: GateRole }) {
  if (role === "applicant") {
    return (
      <p>
        You have an outstanding Flow Council application but have not set your
        notification preferences. You may miss important communications from the
        round operator if you don&apos;t set your preferences. Set them below
        and you can edit them any time <Link href="/profile">here</Link>.
      </p>
    );
  }

  if (role === "admin") {
    return (
      <p>
        You have been added as an admin on a Flow Council but have not set your
        notification preferences. You may miss important communications related
        to your funding round. Set them below and you can edit them any time{" "}
        <Link href="/profile">here</Link>.
      </p>
    );
  }

  return (
    <p>
      We&apos;ve updated how email notifications work. Please confirm your email
      and choose what you want to hear about.
    </p>
  );
}

export default function ConsentGate() {
  const { data: session, status } = useSession();
  const { promptSignal } = useNotificationGate();

  const [show, setShow] = useState(false);
  const [profile, setProfile] = useState<ProfileShape | null>(null);
  const [role, setRole] = useState<GateRole>(null);
  const [email, setEmail] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [toggles, setToggles] = useState<NotificationToggles>(DEFAULT_TOGGLES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(
    async (force: boolean) => {
      if (status !== "authenticated" || !session?.address) return;

      const address = session.address.toLowerCase();

      // UX-only gate: sessionStorage suppresses the modal after "Not now" for
      // the current browser session only. A post-submit prompt passes force to
      // bypass it, since that's a deliberate "you just skipped this" nudge. The
      // authoritative gate remains server-side (`consent_confirmed_at IS NOT
      // NULL` in the dispatch pipeline) — do not remove the server check
      // thinking this is sufficient.
      if (!force) {
        const dismissedAt = sessionStorage.getItem(
          `${DISMISS_KEY_PREFIX}${address}`,
        );
        if (dismissedAt) return;
      }

      try {
        const res = await fetch(
          `/api/flow-council/profile?address=${address}&includePrivate=true`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          success: boolean;
          profile: ProfileShape | null;
        };
        if (!json.success || !json.profile) return;

        const p = json.profile;

        // Only prompt when consent hasn't been recorded yet.
        if (p.consentConfirmedAt !== null) return;

        // Classify the wallet so the copy matches its relationship to a round.
        // Falls back to the generic copy if classification fails.
        let resolvedRole: GateRole = null;
        try {
          const roleRes = await fetch("/api/flow-council/notification-role");
          if (roleRes.ok) {
            const roleJson = (await roleRes.json()) as {
              success: boolean;
              role: GateRole;
            };
            if (roleJson.success) resolvedRole = roleJson.role;
          }
        } catch {
          // Keep resolvedRole null — generic copy is a safe default.
        }

        setProfile(p);
        setRole(resolvedRole);
        setEmail(p.email ?? "");
        setToggles({
          notifyApplicationEligibility: p.notifyApplicationEligibility,
          notifyProjectChannels: p.notifyProjectChannels,
          notifyRoundAnnouncements: p.notifyRoundAnnouncements,
          notifyInternalReview: p.notifyInternalReview,
          notifyPlatform: p.notifyPlatform,
        });
        setShow(true);
      } catch {
        // Silent — nothing useful we can show before the modal is open.
      }
    },
    [status, session?.address],
  );

  // Prompt on sign-in (respecting a prior "Not now" for this session).
  useEffect(() => {
    runCheck(false);
  }, [runCheck]);

  // Re-prompt on demand, e.g. right after an application is submitted. Forced so
  // a "Not now" earlier in the session doesn't swallow this key moment.
  useEffect(() => {
    if (promptSignal === 0) return;
    runCheck(true);
  }, [promptSignal, runCheck]);

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
        ...toggles,
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
        <GateMessage role={role} />
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
        <EmailNotificationPreferences
          idPrefix="consent-modal"
          consentChecked={consentChecked}
          onConsentChange={setConsentChecked}
          toggles={toggles}
          onToggleChange={(field, checked) =>
            setToggles((prev) => ({ ...prev, [field]: checked }))
          }
        />
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
