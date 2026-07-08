"use client";

import { useState, useEffect, useRef } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import Alert from "react-bootstrap/Alert";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import CharacterCounter from "@/app/flow-councils/components/CharacterCounter";
import {
  type SocialAccount,
  ROUND_NAME_TOKEN,
  ROUND_LINK_TOKEN,
  MENTION_TOKEN_REGEX,
  X_CHAR_LIMIT,
  FARCASTER_CHAR_LIMIT,
  getEffectiveCharCount,
  getVoteSocialShare,
  getSocialShare,
} from "@/app/flow-councils/lib/socialShare";

type ShareMessageEditorProps = {
  title: string;
  variant: "vote" | "donation";
  template: string;
  accounts: SocialAccount[];
  roundName: string;
  roundLink: string;
  disabled: boolean;
  onChange: (template: string) => void;
  onValidityChange: (validity: {
    xOver: boolean;
    farcasterOver: boolean;
  }) => void;
};

export default function ShareMessageEditor(props: ShareMessageEditorProps) {
  const {
    title,
    variant,
    template,
    accounts,
    roundName,
    roundLink,
    disabled,
    onChange,
    onValidityChange,
  } = props;

  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionInsertIndex, setMentionInsertIndex] = useState<number | null>(
    null,
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typedMentionTemplateRef = useRef<string | null>(null);

  const mentionableAccounts = accounts.filter((account) => account.name.trim());
  const shareContext = { roundName, roundLink, accounts };
  const xCount = getEffectiveCharCount(template, "x", shareContext);
  const farcasterCount = getEffectiveCharCount(
    template,
    "farcaster",
    shareContext,
  );
  const xOver = xCount > X_CHAR_LIMIT;
  const farcasterOver = farcasterCount > FARCASTER_CHAR_LIMIT;

  useEffect(() => {
    onValidityChange({ xOver, farcasterOver });
  }, [xOver, farcasterOver, onValidityChange]);

  // A typed-@ dropdown pins an insertion index into the template it was opened
  // on; any other template change invalidates that index, so close it.
  useEffect(() => {
    if (
      showMentionDropdown &&
      mentionInsertIndex !== null &&
      template !== typedMentionTemplateRef.current
    ) {
      setShowMentionDropdown(false);
      setMentionInsertIndex(null);
    }
  }, [template, showMentionDropdown, mentionInsertIndex]);

  const mentionedNames = Array.from(
    new Set(
      Array.from(template.matchAll(MENTION_TOKEN_REGEX), (match) => match[1]),
    ),
  );

  const warnings: string[] = [];

  if (template.trim() && !template.includes(ROUND_LINK_TOKEN)) {
    warnings.push(
      "Without {round link}, posts won't link back to your round and won't show the share image card.",
    );
  }

  if (template.includes(ROUND_NAME_TOKEN) && !roundName) {
    warnings.push("This round has no name yet, so {round name} will be empty.");
  }

  for (const name of mentionedNames) {
    const account = accounts.find((a) => a.name.trim() === name.trim());

    if (!account) {
      warnings.push(
        `No account named '${name}', so this mention will post as plain text.`,
      );
      continue;
    }

    if (!account.xHandle) {
      warnings.push(
        `Mentions of '${name}' will appear as plain text on X until you add a handle.`,
      );
    }

    if (!account.farcasterHandle) {
      warnings.push(
        `Mentions of '${name}' will appear as plain text on Farcaster until you add a handle.`,
      );
    }
  }

  const restoreFocus = (caretPosition: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(caretPosition, caretPosition);
    });
  };

  const insertAtCaret = (text: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? template.length;
    const end = textarea?.selectionEnd ?? template.length;

    onChange(template.slice(0, start) + text + template.slice(end));
    restoreFocus(start + text.length);
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const caret = e.target.selectionStart ?? value.length;

    if (
      mentionableAccounts.length > 0 &&
      value.length > template.length &&
      caret > 0 &&
      value[caret - 1] === "@"
    ) {
      setMentionInsertIndex(caret - 1);
      setShowMentionDropdown(true);
      typedMentionTemplateRef.current = value;
    }

    onChange(value);
  };

  const handleMentionSelect = (name: string) => {
    const token = `@[${name.trim()}]`;

    if (mentionInsertIndex !== null && template[mentionInsertIndex] === "@") {
      onChange(
        template.slice(0, mentionInsertIndex) +
          token +
          template.slice(mentionInsertIndex + 1),
      );
      restoreFocus(mentionInsertIndex + token.length);
    } else {
      insertAtCaret(token);
    }

    setShowMentionDropdown(false);
    setMentionInsertIndex(null);
  };

  const openPreview = (platform: "twitter" | "farcaster") => {
    const shareArgs = {
      councilName: roundName,
      councilUiLink: roundLink,
      social:
        variant === "vote"
          ? { accounts, voteMessage: template }
          : { accounts, donationMessage: template },
    };
    const shareUrls =
      variant === "vote"
        ? getVoteSocialShare(shareArgs)
        : getSocialShare(shareArgs);

    window.open(shareUrls[platform], "_blank");
  };

  return (
    <Form.Group
      controlId={`share-message-${variant}`}
      className="d-flex flex-column mt-3"
    >
      <Form.Label className="fs-lg fw-semi-bold">{title}</Form.Label>
      <Stack direction="horizontal" gap={2} className="mb-2 flex-wrap">
        {mentionableAccounts.length === 0 ? (
          <OverlayTrigger
            overlay={<Tooltip>Add an account to enable mentions</Tooltip>}
          >
            <span className="d-inline-block">
              <Button
                variant="secondary"
                size="sm"
                disabled
                style={{ pointerEvents: "none" }}
              >
                @ Mention
              </Button>
            </span>
          </OverlayTrigger>
        ) : (
          <Dropdown
            show={showMentionDropdown}
            onToggle={(nextShow) => {
              setShowMentionDropdown(nextShow);

              if (!nextShow) {
                setMentionInsertIndex(null);
              }
            }}
          >
            <Dropdown.Toggle variant="secondary" size="sm" disabled={disabled}>
              @ Mention
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {mentionableAccounts.map((account) => (
                <Dropdown.Item
                  key={account.id}
                  onClick={() => handleMentionSelect(account.name)}
                >
                  {account.name}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => insertAtCaret(ROUND_NAME_TOKEN)}
        >
          Insert {ROUND_NAME_TOKEN}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => insertAtCaret(ROUND_LINK_TOKEN)}
        >
          Insert {ROUND_LINK_TOKEN}
        </Button>
      </Stack>
      <Form.Control
        as="textarea"
        rows={4}
        value={template}
        disabled={disabled}
        ref={textareaRef}
        className="bg-white border-0 py-3 px-3"
        style={{ resize: "vertical" }}
        onChange={handleTemplateChange}
      />
      <Stack
        direction="horizontal"
        gap={2}
        className="justify-content-end flex-wrap"
      >
        <CharacterCounter
          value={template}
          count={xCount}
          max={X_CHAR_LIMIT}
          label="X"
        />
        <CharacterCounter
          value={template}
          count={farcasterCount}
          max={FARCASTER_CHAR_LIMIT}
          label="Farcaster"
        />
      </Stack>
      {warnings.map((warning) => (
        <Alert key={warning} variant="warning" className="mt-2 mb-0 py-2 small">
          {warning}
        </Alert>
      ))}
      <Stack direction="horizontal" gap={3} className="mt-2">
        <Button
          variant="link"
          className="p-0 text-decoration-underline fw-semi-bold text-primary"
          disabled={disabled}
          onClick={() => openPreview("twitter")}
        >
          Preview on X
        </Button>
        <Button
          variant="link"
          className="p-0 text-decoration-underline fw-semi-bold text-primary"
          disabled={disabled}
          onClick={() => openPreview("farcaster")}
        >
          Preview on Farcaster
        </Button>
      </Stack>
    </Form.Group>
  );
}
