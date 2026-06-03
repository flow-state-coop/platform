import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import type { GroupOption, SubgraphVoter } from "./voterTableTypes";

type MoveVoterModalProps = {
  // Non-null shows the modal; the voter itself is only used to drive visibility.
  target: SubgraphVoter | null;
  otherGroups: GroupOption[];
  selectedGroupId: string;
  isMoving: boolean;
  error: string;
  onSelectGroup: (groupId: string) => void;
  onCancel: () => void;
  onMove: () => void;
};

export default function MoveVoterModal({
  target,
  otherGroups,
  selectedGroupId,
  isMoving,
  error,
  onSelectGroup,
  onCancel,
  onMove,
}: MoveVoterModalProps) {
  return (
    <Modal show={!!target} centered onHide={onCancel}>
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">Move to group</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4 pt-0">
        <p className="text-info">
          Moving a voter changes their group classification only. Their vote
          allocation is unchanged and no transaction is sent.
        </p>
        <Form.Group>
          <Form.Label className="fw-semi-bold">Target group</Form.Label>
          <Form.Select
            value={selectedGroupId}
            disabled={isMoving}
            onChange={(e) => onSelectGroup(e.target.value)}
          >
            {otherGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        {error ? (
          <Alert variant="danger" className="mt-3 mb-0">
            {error}
          </Alert>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <Button
          variant="secondary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onCancel}
          disabled={isMoving}
        >
          Cancel
        </Button>
        <Button
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onMove}
          disabled={isMoving || !selectedGroupId}
        >
          {isMoving ? <Spinner size="sm" /> : "Move"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
