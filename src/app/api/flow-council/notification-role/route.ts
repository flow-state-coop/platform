import { getServerSession } from "next-auth/next";
import { db } from "../db";
import type { ApplicationStatus } from "@/generated/kysely";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export type NotificationGateRole = "applicant" | "admin" | null;

// Statuses that count as an "outstanding" application (everything except
// rejected/removed). A positive IN list rather than NOT IN so a newly added
// status doesn't silently count as outstanding until it's listed here.
const OUTSTANDING_APPLICATION_STATUSES: ApplicationStatus[] = [
  "INCOMPLETE",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "ACCEPTED",
  "GRADUATED",
];

// Classifies the signed-in wallet's relationship to a Flow Council round so the
// notification-prefs prompt can show role-specific copy. Applicant takes
// priority over admin. "Applicant" means the wallet manages a project with an
// outstanding application. "Admin" means the wallet was explicitly added as a
// round admin.
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
