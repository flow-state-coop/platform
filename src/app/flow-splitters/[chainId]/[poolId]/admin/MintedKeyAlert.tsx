"use client";

import Alert from "react-bootstrap/Alert";
import CopyTooltip from "@/components/CopyTooltip";

type MintedKeyAlertProps = {
  token: string;
  onDismiss: () => void;
};

export default function MintedKeyAlert(props: MintedKeyAlertProps) {
  const { token, onDismiss } = props;

  if (!token) {
    return null;
  }

  return (
    <Alert
      variant="success"
      dismissible
      onClose={onDismiss}
      // ph-no-capture blocks the whole subtree from session replay, so the
      // token stays out of it even if the markup below is refactored and the
      // `sensitive` text mask stops covering it.
      className="ph-no-capture mb-3"
    >
      <p className="fw-semi-bold mb-1">
        Copy your key now. It won&apos;t be shown again.
      </p>
      <CopyTooltip
        contentClick="Copied"
        contentHover="Copy key"
        target={
          // `sensitive` is what PostHog's session replay masks on (see
          // maskTextSelector in providers.tsx). This page starts session
          // recording, so without it every mint ships a working bearer token
          // into the replay store.
          <code className="sensitive d-block bg-white rounded-4 p-2 text-break text-start">
            {token}
          </code>
        }
        handleCopy={() => navigator.clipboard.writeText(token)}
      />
    </Alert>
  );
}
