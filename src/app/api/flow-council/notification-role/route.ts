import { getServerSession } from "next-auth/next";
import { db } from "../db";
import type { ApplicationStatus } from "@/generated/kysely";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export type NotificationGateRole = "applicant" | "admin" | null;

// Allow-list, not a NOT IN: a new status counts as not-outstanding until added here.
const OUTSTANDING_APPLICATION_STATUSES: ApplicationStatus[] = [
  "INCOMPLETE",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "ACCEPTED",
  "GRADUATED",
];

// Applicant takes priority over admin when a wallet matches both.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return jsonResponse({ success: true, role: null });
    }

    const address = session.address.toLowerCase();

    const [application, admin] = await Promise.all([
      db
        .selectFrom("applications")
        .innerJoin(
          "projectManagers",
          "applications.projectId",
          "projectManagers.projectId",
        )
        .select("applications.id")
        .where("projectManagers.managerAddress", "=", address)
        .where("applications.status", "in", OUTSTANDING_APPLICATION_STATUSES)
        .executeTakeFirst(),
      db
        .selectFrom("roundAdmins")
        .select("id")
        .where("adminAddress", "=", address)
        .executeTakeFirst(),
    ]);

    const role: NotificationGateRole = application
      ? "applicant"
      : admin
        ? "admin"
        : null;

    return jsonResponse({ success: true, role });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, role: null }, 500);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
