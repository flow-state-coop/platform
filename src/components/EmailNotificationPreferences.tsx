"use client";

import type { ReactNode } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import { CONSENT_TEXT } from "@/lib/consent";

export type NotificationToggles = {
  notifyApplicationEligibility: boolean;
  notifyProjectChannels: boolean;
  notifyRoundAnnouncements: boolean;
  notifyInternalReview: boolean;
  notifyPlatform: boolean;
};

export const NOTIFICATION_FIELDS: {
  field: keyof NotificationToggles;
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

type Props = {
  idPrefix: string;
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  toggles: NotificationToggles;
  onToggleChange: (field: keyof NotificationToggles, checked: boolean) => void;
  consentDisabled?: boolean;
  helperText?: ReactNode;
};

export default function EmailNotificationPreferences({
  idPrefix,
  consentChecked,
  onConsentChange,
  toggles,
  onToggleChange,
  consentDisabled = false,
  helperText = null,
}: Props) {
  return (
    <>
      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          id={`${idPrefix}-consent`}
          checked={consentChecked}
          disabled={consentDisabled}
          onChange={(e) => onConsentChange(e.target.checked)}
          label={CONSENT_TEXT}
        />
        {helperText}
      </Form.Group>

      <Stack gap={2}>
        {NOTIFICATION_FIELDS.map(({ field, label }) => (
          <Form.Check
            key={field}
            type="switch"
            id={`${idPrefix}-${field}`}
            checked={toggles[field]}
            disabled={!consentChecked}
            onChange={(e) => onToggleChange(field, e.target.checked)}
            label={label}
          />
        ))}
      </Stack>
    </>
  );
}
