import { ApplicationStatus } from "@/generated/kysely";

// Status changes a recipient manager may apply from the review UI, keyed by
// current status. Shared by the client dropdown and the server route so the
// allowed set cannot drift between them.
export function getAllowedStatusTransitions(
  currentStatus: ApplicationStatus,
): ApplicationStatus[] {
  switch (currentStatus) {
    case "ACCEPTED":
      return ["SUBMITTED", "REMOVED", "GRADUATED"];
    case "REMOVED":
      return ["ACCEPTED"];
    case "GRADUATED":
      return ["ACCEPTED", "REMOVED"];
    // Pre-acceptance statuses (INCOMPLETE, SUBMITTED, CHANGES_REQUESTED,
    // REJECTED) can be accepted, asked for changes, or rejected.
    default:
      return (
        ["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"] as ApplicationStatus[]
      ).filter((status) => status !== currentStatus);
  }
}
