import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import SuccessCheckmark from "@/app/flow-councils/components/SuccessCheckmark";
import type { ChunkedQueue, SubmitPhase } from "./voterTableTypes";

type SaveConfirmModalProps = {
  show: boolean;
  addCount: number;
  changeCount: number;
  removeCount: number;
  castWarningCount: number;
  submitPhase: SubmitPhase;
  saveError: string;
  // True while mid-submission: the modal must not be dismissed or re-triggered
  // (an in-flight queue error is the one interactive exception).
  submitBusy: boolean;
  q: ChunkedQueue;
  onConfirm: () => void;
  onClose: () => void;
};

export default function SaveConfirmModal({
  show,
  addCount,
  changeCount,
  removeCount,
  castWarningCount,
  submitPhase,
  saveError,
  submitBusy,
  q,
  onConfirm,
  onClose,
}: SaveConfirmModalProps) {
  const failedMidQueue = submitPhase === "submitting" && !!q.error;

  return (
    <Modal
      show={show}
      centered
      onHide={() => {
        if (!submitBusy) {
          onClose();
        }
      }}
    >
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">Save changes</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4 pt-0">
        <p className="mb-2">This will submit onchain transaction(s) to:</p>
        <ul className="mb-0">
          {addCount > 0 ? (
            <li>
              <span className="fw-semi-bold">Add {addCount}</span> voter(s)
            </li>
          ) : null}
          {changeCount > 0 ? (
            <li>
              <span className="fw-semi-bold">Change {changeCount}</span>{" "}
              allocation(s)
            </li>
          ) : null}
          {removeCount > 0 ? (
            <li>
              <span className="fw-semi-bold">Remove {removeCount}</span>{" "}
              voter(s)
            </li>
          ) : null}
        </ul>
        {castWarningCount > 0 ? (
          <Alert variant="warning" className="mt-3 mb-0">
            {castWarningCount} affected voter(s) have already cast and would be
            reduced below their cast count. Cast votes remain; only future votes
            are capped.
          </Alert>
        ) : null}
        {saveError ? (
          <Alert variant="danger" className="mt-3 mb-0">
            {saveError}
          </Alert>
        ) : failedMidQueue ? (
          <Alert variant="danger" className="mt-3 mb-0">
            {q.error?.message} — some transaction(s) didn&apos;t complete. Retry
            to finish, or discard to start over.
          </Alert>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <Button
          variant="secondary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onClose}
          disabled={submitBusy}
        >
          {failedMidQueue ? "Discard" : "Cancel"}
        </Button>
        <Button
          variant={submitPhase === "done" ? "success" : "primary"}
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={failedMidQueue ? () => q.resume() : onConfirm}
          disabled={submitBusy}
        >
          {submitPhase === "saving" ? (
            <Spinner size="sm" />
          ) : failedMidQueue ? (
            "Retry"
          ) : submitPhase === "submitting" ? (
            <>
              <Spinner size="sm" />
              {q.totalCount > 1
                ? ` ${Math.min(q.completedCount + 1, q.totalCount)}/${q.totalCount}`
                : ""}
            </>
          ) : submitPhase === "done" ? (
            <SuccessCheckmark />
          ) : (
            "Confirm"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
