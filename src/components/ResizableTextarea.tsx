"use client";

import { useRef, useCallback, TextareaHTMLAttributes } from "react";
import Form from "react-bootstrap/Form";
import Image from "next/image";

type ResizableTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number;
  isInvalid?: boolean;
};

export default function ResizableTextarea(props: ResizableTextareaProps) {
  const { minHeight = 80, style, isInvalid, disabled, ...rest } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const startY = e.clientY;
      const startHeight = textarea.offsetHeight;

      const handleMouseMove = (e: MouseEvent) => {
        const newHeight = Math.max(minHeight, startHeight + e.clientY - startY);
        textarea.style.height = `${newHeight}px`;
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [minHeight],
  );

  return (
    <div style={{ position: "relative" }}>
      <Form.Control
        as="textarea"
        ref={textareaRef}
        style={{ ...style, resize: "none" }}
        isInvalid={isInvalid}
        disabled={disabled}
        {...(rest as object)}
      />
      {!disabled && (
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            cursor: "ns-resize",
            opacity: 0.5,
            userSelect: "none",
          }}
        >
          <Image
            src="/resize-handle.svg"
            alt="resize"
            width={24}
            height={24}
            style={{ transform: "rotate(-45deg)" }}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
