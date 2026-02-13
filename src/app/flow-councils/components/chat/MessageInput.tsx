"use client";

import { useState } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import MarkdownEditor from "@/components/MarkdownEditor";

type MessageInputProps = {
  onSend: (content: string, sendEmail?: boolean) => Promise<void>;
  isSending: boolean;
  showEmailCheckbox?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export default function MessageInput(props: MessageInputProps) {
  const {
    onSend,
    isSending,
    showEmailCheckbox = false,
    disabled = false,
    placeholder = "Write a message. Markdown is supported.",
  } = props;

  const [content, setContent] = useState("");
  const [sendEmail, setSendEmail] = useState(false);

  const handleSend = async () => {
    if (!content.trim() || disabled) return;

    await onSend(content.trim(), sendEmail);
    setContent("");
    setSendEmail(false);
  };

  return (
    <div>
      <Form.Group className="mb-3">
        <MarkdownEditor
          rows={3}
          value={content}
          placeholder={placeholder}
          onChange={(e) => setContent(e.target.value)}
          disabled={isSending || disabled}
          resizable
        />
      </Form.Group>

      <Stack direction="horizontal" gap={3} className="justify-content-between">
        {showEmailCheckbox ? (
          <Form.Check
            type="checkbox"
            id="send-email-checkbox"
            label="Send email notification"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            disabled={isSending || disabled}
            className="text-muted small"
          />
        ) : (
          <div />
        )}

        <Button
          className="rounded-4 px-4 py-2 fw-semi-bold"
          disabled={!content.trim() || isSending || disabled}
          onClick={handleSend}
        >
          {isSending ? <Spinner size="sm" /> : "Send"}
        </Button>
      </Stack>
    </div>
  );
}
