import { SendEmailCommand } from "@aws-sdk/client-ses";
import { db } from "@/app/api/flow-council/db";
import {
  sesClient,
  SES_FROM_EMAIL,
  SES_CONFIGURATION_SET,
} from "@/app/api/flow-council/ses";
import { getAcceptedGranteeEmails } from "@/app/api/flow-council/email";
import { GOODBUILDERS_COUNCIL_ADDRESSES } from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

const SEND_DATES = ["2026-03-31", "2026-04-14", "2026-04-28", "2026-05-12"];

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
    const rounds = await db
      .selectFrom("rounds")
      .select("id")
      .where(
        "flowCouncilAddress",
        "in",
        GOODBUILDERS_COUNCIL_ADDRESSES.map((a) => a.toLowerCase()),
      )
      .execute();

    const emailArrays = await Promise.all(
      rounds.map((r) => getAcceptedGranteeEmails(r.id)),
    );
    const recipients = [...new Set(emailArrays.flat())];

    if (recipients.length === 0) {
      return Response.json({ success: true, recipientCount: 0 });
    }

    const command = new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [SES_FROM_EMAIL],
        BccAddresses: recipients,
      },
      Message: {
        Subject: { Data: "Update Your GoodBuilders Milestones" },
        Body: {
          Text: {
            Data: "Hey builders, the epoch is ending soon, please remember to update your milestones before it closes. Drop a quick note on Telegram once you have updated, so the team stays in the loop!",
          },
        },
      },
      ...(SES_CONFIGURATION_SET && {
        ConfigurationSetName: SES_CONFIGURATION_SET,
      }),
    });

    await sesClient.send(command);

    return Response.json({ success: true, recipientCount: recipients.length });
  } catch (error) {
    console.error("Failed to send milestone reminder:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
