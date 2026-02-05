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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const startY = e.clientY;
      const startHeight = textarea.offsetHeight;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const newHeight = Math.max(
          minHeight,
          startHeight + moveEvent.clientY - startY,
        );
        textarea.style.height = `${newHeight}px`;
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
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
      <div
        onPointerDown={handlePointerDown}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          cursor: "ns-resize",
          opacity: 0.7,
          userSelect: "none",
          touchAction: "none",
          paddingTop: 10,
          paddingLeft: 10,
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
    </div>
  );
}
