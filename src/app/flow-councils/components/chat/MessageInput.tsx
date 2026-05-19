"use client";

import { useState } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import MarkdownEditor from "@/components/MarkdownEditor";

type MessageInputProps = {
  onSend: (content: string) => Promise<void>;
  isSending: boolean;
  disabled?: boolean;
  placeholder?: string;
  onAuthRequired?: () => void;
};

export default function MessageInput(props: MessageInputProps) {
  const {
    onSend,
    isSending,
    disabled = false,
    placeholder = "Write a message. Markdown is supported.",
    onAuthRequired,
  } = props;

  const [content, setContent] = useState("");

  const handleSend = async () => {
    if (!content.trim() || disabled) return;

    await onSend(content.trim());
    setContent("");
  };

  if (disabled && onAuthRequired) {
    return (
      <Button
        variant="secondary"
        className="w-100 py-4 rounded-4 fw-semi-bold fs-lg d-flex justify-content-center align-items-center gap-2"
        onClick={onAuthRequired}
      >
        Sign In to Post
      </Button>
    );
  }

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
        <div />

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
