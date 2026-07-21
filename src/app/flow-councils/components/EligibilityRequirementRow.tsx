import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";

export type RequirementRowStatus =
  | "pending"
  | "met"
  | "unmet"
  | "unknown"
  | "unavailable"
  | "unchecked";

export default function EligibilityRequirementRow({
  name,
  votes,
  status,
  acquisitionUrl,
  onRetry,
}: {
  name: string;
  votes: number;
  status: RequirementRowStatus;
  acquisitionUrl?: string | null;
  onRetry?: () => void;
}) {
  return (
    <Stack
      direction="horizontal"
      gap={3}
      className={`justify-content-between align-items-start bg-lace-100 rounded-4 p-3 ${
        status === "unavailable" ? "opacity-50" : ""
      }`}
    >
      <Stack direction="vertical" gap={1}>
        <span className="fw-semi-bold">{name}</span>
        <span className="text-info">
          {votes} {votes === 1 ? "vote" : "votes"}
        </span>
        {status === "unmet" && acquisitionUrl ? (
          <a
            href={acquisitionUrl}
            target="_blank"
            rel="noreferrer"
            className="small text-primary text-decoration-none"
          >
            Get this NFT
          </a>
        ) : null}
        {status === "unknown" ? (
          <span className="small text-danger">
            Couldn&apos;t check right now
          </span>
        ) : null}
      </Stack>
      <Stack direction="horizontal" gap={2} className="align-items-center">
        {status === "pending" ? <Spinner size="sm" /> : null}
        {status === "met" ? (
          <span className="text-success fw-semi-bold">&#10003; Met</span>
        ) : null}
        {status === "unmet" ? <span className="text-info">Not met</span> : null}
        {status === "unknown" && onRetry ? (
          <Button
            variant="link"
            size="sm"
            className="p-0 fw-semi-bold text-decoration-none"
            onClick={onRetry}
          >
            Retry
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
