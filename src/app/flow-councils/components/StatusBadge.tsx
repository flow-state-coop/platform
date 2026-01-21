type StatusBadgeProps = {
  status:
    | "SUBMITTED"
    | "ACCEPTED"
    | "CHANGES_REQUESTED"
    | "REJECTED"
    | "GRADUATED"
    | "REMOVED"
    | "INCOMPLETE"
    | null;
  className?: string;
};

const STATUS_CONFIG = {
  INCOMPLETE: { color: "#d95d39", label: "Incomplete" },
  SUBMITTED: { color: "#056589", label: "Submitted" },
  ACCEPTED: { color: "#45ad57", label: "Accepted" },
  CHANGES_REQUESTED: { color: "#ffc107", label: "Changes Requested" },
  REJECTED: { color: "#dc3545", label: "Rejected" },
  GRADUATED: { color: "#679a8b", label: "Graduated" },
  REMOVED: { color: "#888888", label: "Removed" },
} as const;

export default function StatusBadge({
  status,
  className = "",
}: StatusBadgeProps) {
  if (!status) return null;

  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={`px-2 py-1 rounded-3 fw-medium ${className}`}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
        fontSize: "0.75rem",
      }}
    >
      {config.label}
    </span>
  );
}
