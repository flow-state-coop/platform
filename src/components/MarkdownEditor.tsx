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
  | "unorderedList"
  | "quote"
  | "code";

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

const TOOLBAR_ACTIONS: { action: MarkdownAction; icon: React.ReactNode }[] = [
  {
    action: "heading",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3.75 2a.75.75 0 0 1 .75.75V7h7V2.75a.75.75 0 0 1 1.5 0v10.5a.75.75 0 0 1-1.5 0V8.5h-7v4.75a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 3.75 2Z" />
      </svg>
    ),
  },
  {
    action: "bold",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2h4.5a3.501 3.501 0 0 1 2.852 5.53A3.499 3.499 0 0 1 9.5 14H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm1 7v3h4.5a1.5 1.5 0 0 0 0-3Zm3.5-2a1.5 1.5 0 0 0 0-3H5v3Z" />
      </svg>
    ),
  },
  {
    action: "italic",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 2.75A.75.75 0 0 1 6.75 2h6.5a.75.75 0 0 1 0 1.5h-2.505l-3.858 9H9.25a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.505l3.858-9H6.75A.75.75 0 0 1 6 2.75Z" />
      </svg>
    ),
  },
  {
    action: "quote",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.75 2.5h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Zm4 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2.5 7.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 1.5 0Z" />
      </svg>
    ),
  },
  {
    action: "code",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z" />
      </svg>
    ),
  },
  {
    action: "link",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z" />
      </svg>
    ),
  },
  {
    action: "orderedList",
    icon: (
      <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
        <path d="M120-80v-60h100v-30h-60v-60h60v-30H120v-60h120q17 0 28.5 11.5T280-280v40q0 17-11.5 28.5T240-200q17 0 28.5 11.5T280-160v40q0 17-11.5 28.5T240-80H120Zm0-280v-110q0-17 11.5-28.5T160-510h60v-30H120v-60h120q17 0 28.5 11.5T280-560v70q0 17-11.5 28.5T240-450h-60v30h100v60H120Zm60-280v-180h-60v-60h120v240h-60Zm180 440v-80h480v80H360Zm0-240v-80h480v80H360Zm0-240v-80h480v80H360Z" />
      </svg>
    ),
  },
  {
    action: "unorderedList",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
      </svg>
    ),
  },
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
    case "quote":
      return { before: "> ", after: "", placeholder: "Quote" };
    case "code":
      return { before: "`", after: "`", placeholder: "code" };
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
    <>
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
              {TOOLBAR_ACTIONS.map(({ action, icon }) => (
                <button
                  key={action}
                  type="button"
                  className={styles.toolbarButton}
                  disabled={disabled}
                  onMouseDown={(e) => handleToolbarMouseDown(e, action)}
                  title={action.charAt(0).toUpperCase() + action.slice(1)}
                >
                  {icon}
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
          <div className={styles.preview} style={{ minHeight: rows * 24 + 24 }}>
            {value ? (
              <Markdown>{value}</Markdown>
            ) : (
              <span className={styles.emptyPreview}>Nothing to preview</span>
            )}
          </div>
        )}
      </div>

      {characterCounter && (
        <CharacterCounter
          value={characterCounter.value}
          min={characterCounter.min}
          max={characterCounter.max}
        />
      )}
    </>
  );
}
