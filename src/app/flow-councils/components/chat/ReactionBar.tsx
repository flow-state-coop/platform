"use client";

import { useState, useRef } from "react";
import Badge from "react-bootstrap/Badge";
import Overlay from "react-bootstrap/Overlay";
import Popover from "react-bootstrap/Popover";
import Stack from "react-bootstrap/Stack";
import { ALLOWED_REACTIONS } from "../../lib/constants";

export type ReactionSummary = {
  emoji: string;
  count: number;
  hasReacted: boolean;
};

type ReactionBarProps = {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
};

export default function ReactionBar({ reactions, onToggle }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  return (
    <Stack direction="horizontal" gap={1} className="flex-wrap mt-2">
      {reactions.map((r) => (
        <Badge
          key={r.emoji}
          bg=""
          text="dark"
          className={`d-inline-flex align-items-center gap-1 fw-normal border ${r.hasReacted ? "border-primary" : ""}`}
          role="button"
          onClick={() => onToggle(r.emoji)}
          style={{ cursor: "pointer", fontSize: "0.85rem" }}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </Badge>
      ))}
      <button
        ref={pickerRef}
        onClick={() => setShowPicker(!showPicker)}
        className="btn btn-sm btn-outline-secondary border rounded-pill d-inline-flex align-items-center justify-content-center"
        style={{ width: 28, height: 28, padding: 0, fontSize: "0.8rem" }}
      >
        +
      </button>
      <Overlay
        target={pickerRef.current}
        show={showPicker}
        placement="top"
        rootClose
        onHide={() => setShowPicker(false)}
      >
        <Popover>
          <Popover.Body className="p-2">
            <Stack direction="horizontal" gap={1}>
              {ALLOWED_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="btn btn-sm btn-light"
                  style={{ fontSize: "1.1rem", padding: "2px 6px" }}
                  onClick={() => {
                    onToggle(emoji);
                    setShowPicker(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </Stack>
          </Popover.Body>
        </Popover>
      </Overlay>
    </Stack>
  );
}
