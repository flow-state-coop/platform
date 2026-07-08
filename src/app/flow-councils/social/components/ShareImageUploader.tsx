"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import { ALLOWED_IMAGE_TYPES } from "@/app/flow-councils/lib/constants";

type ShareImageUploaderProps = {
  shareImageUrl: string;
  shareImageBlob: Blob | null;
  disabled: boolean;
  onSelectBlob: (blob: Blob) => void;
  onRemove: () => void;
};

export default function ShareImageUploader(props: ShareImageUploaderProps) {
  const { shareImageUrl, shareImageBlob, disabled, onSelectBlob, onRemove } =
    props;

  const [fileError, setFileError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(
    () => (shareImageBlob ? URL.createObjectURL(shareImageBlob) : ""),
    [shareImageBlob],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileUpload = () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];

    if (!input || !file) {
      return;
    }

    input.value = "";

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFileError("Invalid file type (PNG, JPEG, or WebP only)");
    } else if (file.size > 1024 * 1024) {
      setFileError("Size too large (max 1MB)");
    } else {
      setFileError("");
      onSelectBlob(file);
    }
  };

  return (
    <Form.Group className="d-flex flex-column mt-3">
      <Form.Label className="fs-lg fw-semi-bold">Share Image</Form.Label>
      <Card.Text className="m-0 mb-2 text-info small">
        Suggested 1200x630 px (1.91:1). Max 1MB. Replaces the link-preview image
        wherever your round link unfurls (X, Farcaster, Discord).
      </Card.Text>
      <Form.Control
        type="file"
        hidden
        accept=".png,.jpeg,.jpg,.webp"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      <Stack direction="horizontal" gap={4} className="align-items-center">
        <Button
          disabled={disabled}
          className="bg-white border-0"
          style={{
            width: 200,
            height: 100,
            color: "#adb5bd",
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Stack direction="vertical" className="align-items-center">
            <Image src="/upload.svg" alt="upload" width={28} />
            <span className="small">Upload PNG, JPEG, or WebP</span>
          </Stack>
        </Button>
        {fileError ? (
          <Card.Text className="m-0 text-danger">{fileError}</Card.Text>
        ) : (
          (shareImageBlob || shareImageUrl) && (
            <>
              <Image
                src={shareImageBlob ? previewUrl : shareImageUrl}
                alt="share image"
                width={229}
                height={120}
                className="rounded-4"
                style={{ objectFit: "cover" }}
              />
              <Button
                variant="transparent"
                className="p-0"
                disabled={disabled}
                onClick={onRemove}
              >
                <Image src="/close.svg" alt="Remove" width={28} height={28} />
              </Button>
            </>
          )
        )}
      </Stack>
      <Card.Text className="m-0 mt-2 text-info small">
        By uploading, you confirm you have the right to use this image.
      </Card.Text>
      <Card.Text className="m-0 mt-1 text-info small">
        Shows in share cards ONLY AFTER you Save. The change may take up to 24
        hours to update if it is previewed/shared before saving.
      </Card.Text>
    </Form.Group>
  );
}
