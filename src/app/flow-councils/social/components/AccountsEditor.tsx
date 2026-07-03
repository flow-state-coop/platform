"use client";

import { useState } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import { extractSocialHandle } from "@/lib/socialHandles";
import { type SocialAccount } from "@/app/flow-councils/lib/socialShare";

const MAX_ACCOUNTS = 10;

type AccountsEditorProps = {
  accounts: SocialAccount[];
  disabled: boolean;
  onChange: (accounts: SocialAccount[]) => void;
  onRename: (oldName: string, newName: string) => void;
};

export default function AccountsEditor(props: AccountsEditorProps) {
  const { accounts, disabled, onChange, onRename } = props;

  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());

  const updateAccount = (index: number, update: Partial<SocialAccount>) => {
    const next = [...accounts];
    next[index] = { ...next[index], ...update };
    onChange(next);
  };

  const handleNameChange = (index: number, name: string) => {
    onRename(accounts[index].name, name);
    updateAccount(index, { name });
  };

  const handleHandleBlur = (
    index: number,
    field: "xHandle" | "farcasterHandle",
  ) => {
    const raw = accounts[index][field] ?? "";
    const handle = extractSocialHandle(
      raw,
      field === "xHandle" ? "twitter" : "farcaster",
    );

    updateAccount(index, { [field]: handle || undefined });
  };

  const markTouched = (id: string) =>
    setTouchedIds((prev) => new Set(prev).add(id));

  const getNameError = (account: SocialAccount) => {
    const trimmedName = account.name.trim();

    if (!trimmedName) {
      return "Name is required";
    }

    const isDuplicate =
      accounts.filter(
        (other) =>
          other.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      ).length > 1;

    return isDuplicate ? "Name must be unique" : "";
  };

  const getMissingHandleWarning = (account: SocialAccount) => {
    if (!account.name.trim()) {
      return "";
    }

    const hasXHandle = !!account.xHandle;
    const hasFarcasterHandle = !!account.farcasterHandle;

    if (hasXHandle === hasFarcasterHandle) {
      return "";
    }

    const missingPlatform = hasXHandle ? "Farcaster" : "X";

    return `Mentions of this account will appear as plain text '${account.name.trim()}' on ${missingPlatform} until you add a handle.`;
  };

  return (
    <Form.Group className="d-flex flex-column">
      <Form.Label className="fs-lg fw-semi-bold">Accounts</Form.Label>
      <Stack direction="vertical" gap={3}>
        {accounts.map((account, index) => {
          const nameError = getNameError(account);
          const showNameError = !!nameError && touchedIds.has(account.id);
          const missingHandleWarning = getMissingHandleWarning(account);

          return (
            <Stack key={account.id} direction="vertical" gap={1}>
              <Stack direction="horizontal" gap={2}>
                <Form.Control
                  type="text"
                  placeholder="Name"
                  aria-label="Account name"
                  value={account.name}
                  disabled={disabled}
                  className={`py-2 px-3 bg-white ${showNameError ? "border border-2 border-danger" : "border-0"}`}
                  isInvalid={showNameError}
                  onChange={(e) => handleNameChange(index, e.target.value)}
                  onBlur={() => markTouched(account.id)}
                />
                <Form.Control
                  type="text"
                  placeholder="X handle or URL"
                  aria-label="X handle"
                  value={account.xHandle ?? ""}
                  disabled={disabled}
                  className="py-2 px-3 bg-white border-0"
                  onChange={(e) =>
                    updateAccount(index, { xHandle: e.target.value })
                  }
                  onBlur={() => handleHandleBlur(index, "xHandle")}
                />
                <Form.Control
                  type="text"
                  placeholder="Farcaster handle or URL"
                  aria-label="Farcaster handle"
                  value={account.farcasterHandle ?? ""}
                  disabled={disabled}
                  className="py-2 px-3 bg-white border-0"
                  onChange={(e) =>
                    updateAccount(index, { farcasterHandle: e.target.value })
                  }
                  onBlur={() => handleHandleBlur(index, "farcasterHandle")}
                />
                <Button
                  variant="link"
                  className="d-flex align-items-center justify-content-center p-0"
                  disabled={disabled}
                  onClick={() =>
                    onChange(accounts.filter((_, i) => i !== index))
                  }
                >
                  <Image src="/close.svg" alt="Remove" width={28} height={28} />
                </Button>
              </Stack>
              {showNameError && (
                <span className="text-danger small">{nameError}</span>
              )}
              {missingHandleWarning && (
                <Alert variant="warning" className="mt-1 mb-0 py-2 small">
                  {missingHandleWarning}
                </Alert>
              )}
            </Stack>
          );
        })}
        <Button
          variant="link"
          className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
          disabled={disabled || accounts.length >= MAX_ACCOUNTS}
          onClick={() =>
            onChange([...accounts, { id: crypto.randomUUID(), name: "" }])
          }
        >
          Add account
        </Button>
        <Card.Text className="m-0 text-info small">
          Up to 10 accounts per round.
        </Card.Text>
      </Stack>
    </Form.Group>
  );
}
