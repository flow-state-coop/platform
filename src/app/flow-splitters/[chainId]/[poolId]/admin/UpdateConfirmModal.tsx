"use client";

import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";

type UpdateConfirmModalProps = {
  show: boolean;
  warnings: string[];
  onConfirm: () => void;
  onClose: () => void;
};

// No in-flight state: confirming closes this and the save button is disabled
// while a transaction is pending, so the modal cannot be open mid-submit.
export default function UpdateConfirmModal(props: UpdateConfirmModalProps) {
  const { show, warnings, onConfirm, onClose } = props;

  return (
    <Modal show={show} centered onHide={onClose}>
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">Confirm changes</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4 pt-0">
        <p className="mb-2">This will submit an onchain transaction.</p>
        {warnings.map((warning) => (
          <Alert key={warning} variant="warning" className="mb-2">
            {warning}
          </Alert>
        ))}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <Button
          variant="secondary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onConfirm}
        >
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
