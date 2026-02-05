"use client";

import { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import ResizableTextarea from "@/components/ResizableTextarea";

type EditMessageModalProps = {
  show: boolean;
  initialContent: string;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
};

export default function EditMessageModal(props: EditMessageModalProps) {
  const { show, initialContent, onClose, onSave } = props;

  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (show) {
      setContent(initialContent);
      setError("");
    }
  }, [show, initialContent]);

  const handleSave = async () => {
    if (!content.trim()) return;

    try {
      setIsSaving(true);
      setError("");
      await onSave(content.trim());
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save message");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal show={show} centered onHide={onClose}>
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">Edit Message</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <Form.Group>
          <ResizableTextarea
            rows={4}
            value={content}
            className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
            onChange={(e) => setContent(e.target.value)}
            disabled={isSaving}
          />
        </Form.Group>
        {error && (
          <Alert variant="danger" className="mt-3 mb-0">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <Button
          variant="secondary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={handleSave}
          disabled={!content.trim() || isSaving}
        >
          {isSaving ? <Spinner size="sm" /> : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
