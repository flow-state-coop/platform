import { db } from "@/app/api/flow-council/db";
import {
  resolveAcceptedGranteeRecipients,
  resolveAcceptedGranteeAddresses,
  getRoundDetails,
} from "@/app/api/flow-council/email";
import { sendPersonalizedEmail } from "@/app/api/flow-council/ses";
import { writeInboxItems } from "@/lib/inboxWriter";
import { GOODBUILDERS_COUNCIL_ADDRESSES } from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

const SEND_DATES = ["2026-03-31", "2026-04-14", "2026-04-28", "2026-05-12"];

const REMINDER_SUBJECT = "Update Your GoodBuilders Milestones";
const REMINDER_BODY =
  "Hey builders, the epoch is ending soon, please remember to update your milestones before it closes. Drop a quick note on Telegram once you have updated, so the team stays in the loop!";
const INBOX_SNIPPET =
  "Reminder: update your GoodBuilders milestones before the epoch closes.";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  if (!SEND_DATES.includes(today)) {
    return Response.json({ skipped: true, date: today });
  }

  try {
    const baseUrl = new URL(request.url).origin;

    const rounds = await db
      .selectFrom("rounds")
      .select("id")
      .where(
        "flowCouncilAddress",
        "in",
        GOODBUILDERS_COUNCIL_ADDRESSES.map((a) => a.toLowerCase()),
      )
      .execute();

    let totalRecipients = 0;
    let totalInboxItems = 0;

    for (const r of rounds) {
      const [recipients, addresses, details] = await Promise.all([
        resolveAcceptedGranteeRecipients(r.id, "application_eligibility"),
        resolveAcceptedGranteeAddresses(r.id),
        getRoundDetails(r.id),
      ]);

      const roundName = details?.roundName ?? "GoodBuilders";

      if (recipients.length > 0) {
        const templateData = {
          roundName,
          subject: REMINDER_SUBJECT,
          body: REMINDER_BODY,
        };

        const results = await Promise.allSettled(
          recipients.map((recipient) =>
            sendPersonalizedEmail(
              recipient,
              "goodbuilders-milestone-reminder",
              templateData,
              baseUrl,
            ),
          ),
        );

        for (const result of results) {
          if (result.status === "rejected") {
            console.error(
              "Failed to send goodbuilders milestone reminder:",
              result.reason,
            );
          }
        }

        totalRecipients += recipients.length;
      }

      if (addresses.length > 0) {
        await writeInboxItems(
          addresses.map((address) => ({
            recipientAddress: address,
            category: "application_eligibility" as const,
            sourceLabel: roundName,
            snippet: INBOX_SNIPPET,
          })),
        );
        totalInboxItems += addresses.length;
      }
    }

    return Response.json({
      success: true,
      recipientCount: totalRecipients,
      inboxCount: totalInboxItems,
    });
  } catch (error) {
    console.error("Failed to send milestone reminder:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
