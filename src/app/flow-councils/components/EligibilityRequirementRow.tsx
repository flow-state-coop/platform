import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";

export type RequirementRowStatus =
  | "pending"
  | "met"
  | "unmet"
  | "unknown"
  | "unavailable";

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
      className={`justify-content-between align-items-start border rounded-4 p-3 ${
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
            className="small"
          >
            Get this NFT
          </a>
        ) : null}
        {status === "unknown" ? (
          <span className="small text-danger">
            Couldn&apos;t check right now, try again
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
          <span
            role="button"
            tabIndex={0}
            className="text-primary text-decoration-underline"
            onClick={onRetry}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onRetry();
            }}
          >
            Retry
          </span>
        ) : null}
      </Stack>
    </Stack>
  );
}
