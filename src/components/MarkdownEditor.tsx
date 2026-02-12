"use client";

import { useState, useRef, useCallback } from "react";
import Form from "react-bootstrap/Form";
import Markdown from "@/components/Markdown";
import ResizableTextarea from "@/components/ResizableTextarea";
import CharacterCounter from "@/app/flow-councils/components/CharacterCounter";
import styles from "./MarkdownEditor.module.css";

type MarkdownAction =
  | "heading"
  | "bold"
  | "italic"
  | "link"
  | "orderedList"
  | "unorderedList";

type MarkdownEditorProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  isInvalid?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  minHeight?: number;
  resizable?: boolean;
  characterCounter?: { value: string; min?: number; max: number };
};

const TOOLBAR_ACTIONS: { action: MarkdownAction; label: string }[] = [
  { action: "heading", label: "H" },
  { action: "bold", label: "B" },
  { action: "italic", label: "I" },
  { action: "link", label: "Link" },
  { action: "orderedList", label: "1." },
  { action: "unorderedList", label: "-" },
];

function getInsertion(action: MarkdownAction) {
  switch (action) {
    case "heading":
      return { before: "### ", after: "", placeholder: "Heading" };
    case "bold":
      return { before: "**", after: "**", placeholder: "bold text" };
    case "italic":
      return { before: "_", after: "_", placeholder: "italic text" };
    case "link":
      return { before: "[", after: "](url)", placeholder: "link text" };
    case "orderedList":
      return { before: "1. ", after: "", placeholder: "List item" };
    case "unorderedList":
      return { before: "- ", after: "", placeholder: "List item" };
  }
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const {
    value,
    onChange,
    placeholder,
    rows = 3,
    disabled = false,
    isInvalid = false,
    className,
    onKeyDown,
    onBlur,
    minHeight,
    resizable = false,
    characterCounter,
  } = props;

  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleToolbarAction = useCallback(
    (action: MarkdownAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd } = textarea;
      const selectedText = value.substring(selectionStart, selectionEnd);
      const insertion = getInsertion(action);

      const text = selectedText || insertion.placeholder;
      const newValue =
        value.substring(0, selectionStart) +
        insertion.before +
        text +
        insertion.after +
        value.substring(selectionEnd);

      const syntheticEvent = {
        target: { value: newValue },
        currentTarget: { value: newValue },
      } as React.ChangeEvent<HTMLTextAreaElement>;
      onChange(syntheticEvent);

      requestAnimationFrame(() => {
        textarea.focus();
        const selectStart = selectionStart + insertion.before.length;
        const selectEnd = selectStart + text.length;
        textarea.setSelectionRange(selectStart, selectEnd);
      });
    },
    [value, onChange],
  );

  const handleToolbarMouseDown = useCallback(
    (e: React.MouseEvent, action: MarkdownAction) => {
      e.preventDefault();
      handleToolbarAction(action);
    },
    [handleToolbarAction],
  );

  const editorClassName = [
    styles.editor,
    isInvalid ? styles.invalid : "",
    disabled ? styles.disabled : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  const textareaProps = {
    rows,
    value,
    placeholder,
    className: `${styles.textarea} py-3 px-3`,
    onChange,
    onKeyDown,
    onBlur,
    disabled,
    isInvalid: false as const,
  };

  return (
    <div className={editorClassName}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "write" ? styles.active : ""}`}
            onClick={() => setActiveTab("write")}
          >
            Write
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "preview" ? styles.active : ""}`}
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </button>
        </div>

        {activeTab === "write" && (
          <div className={styles.toolbar}>
            {TOOLBAR_ACTIONS.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                className={styles.toolbarButton}
                disabled={disabled}
                onMouseDown={(e) => handleToolbarMouseDown(e, action)}
                title={action.charAt(0).toUpperCase() + action.slice(1)}
                style={
                  label === "B"
                    ? { fontWeight: 700 }
                    : label === "I"
                      ? { fontStyle: "italic" }
                      : undefined
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === "write" ? (
        resizable ? (
          <ResizableTextarea
            ref={textareaRef}
            minHeight={minHeight}
            {...textareaProps}
          />
        ) : (
          <Form.Control
            as="textarea"
            ref={textareaRef}
            style={{ resize: "none", backgroundImage: "none" }}
            {...textareaProps}
          />
        )
      ) : (
        <div
          className={styles.preview}
          style={{ minHeight: rows * 24 + 24 }}
        >
          {value ? (
            <Markdown>{value}</Markdown>
          ) : (
            <span className={styles.emptyPreview}>Nothing to preview</span>
          )}
        </div>
      )}

      {characterCounter && (
        <CharacterCounter
          value={characterCounter.value}
          min={characterCounter.min}
          max={characterCounter.max}
        />
      )}
    </div>
  );
}
