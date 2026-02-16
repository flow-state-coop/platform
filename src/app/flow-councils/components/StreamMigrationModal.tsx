import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";

type StreamMigrationModalProps = {
  show: boolean;
  onHide: () => void;
  tokenSymbol: string;
  combinedMonthlyAmount: string;
  isCancelling: boolean;
  isTransferring: boolean;
  transactionError: string;
  onCancel: () => void;
  onTransfer: () => void;
};

export default function StreamMigrationModal({
  show,
  onHide,
  tokenSymbol,
  combinedMonthlyAmount,
  isCancelling,
  isTransferring,
  transactionError,
  onCancel,
  onTransfer,
}: StreamMigrationModalProps) {
  return (
    <Modal show={show} centered onHide={onHide}>
      <Modal.Header closeButton className="border-0 p-4 pb-0">
        <Modal.Title className="fs-5 fw-bold">Stream Migration</Modal.Title>
      </Modal.Header>
      <Modal.Body className="fs-5 p-4">
        You still have a {combinedMonthlyAmount} {tokenSymbol}/mo stream open to
        the GoodBuilders S2 Pool!
        {transactionError && (
          <p className="text-danger mt-2 mb-0 fs-6">{transactionError}</p>
        )}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <Button
          variant="danger"
          disabled={isCancelling || isTransferring}
          onClick={onCancel}
        >
          {isCancelling ? <Spinner size="sm" /> : "Cancel Stream"}
        </Button>
        <Button
          variant="success"
          disabled={isCancelling || isTransferring}
          onClick={onTransfer}
        >
          {isTransferring ? <Spinner size="sm" /> : "Transfer it to S3"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
