import { SendEmailCommand } from "@aws-sdk/client-ses";
import { sesClient, SES_FROM_EMAIL } from "./ses";
import { db } from "./db";

export const ADMIN_NOTIFICATION_EMAILS = [
  "rael@gooddollar.org",
  "graven@flowstate.network",
];

type ApplicationSubmittedEmailData = {
  baseUrl: string;
  projectName: string;
  roundName: string;
  chainId: number;
  councilId: string;
};

type ApplicationStatusChangedEmailData = {
  baseUrl: string;
  roundName: string;
  chainId: number;
  councilId: string;
  projectId: number;
};

type ChatMessageEmailData = {
  baseUrl: string;
  projectName: string;
  roundName: string;
  chainId: number;
  councilId: string;
  projectId: number;
};

async function sendEmail(
  to: string[],
  subject: string,
  body: string,
): Promise<void> {
  if (to.length === 0) return;

  try {
    const command = new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [SES_FROM_EMAIL],
        BccAddresses: to,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: body,
            Charset: "UTF-8",
          },
        },
      },
    });

    await sesClient.send(command);
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export async function getProjectEmails(projectId: number): Promise<string[]> {
  const emails = await db
    .selectFrom("projectEmails")
    .select("email")
    .where("projectId", "=", projectId)
    .execute();

  return emails.map((e) => e.email);
}

export async function getRoundAdminEmailsExcludingAddress(
  roundId: number,
  excludeAddress?: string,
): Promise<string[]> {
  let query = db
    .selectFrom("roundAdmins")
    .innerJoin(
      "roundAdminEmails",
      "roundAdmins.id",
      "roundAdminEmails.roundAdminId",
    )
    .select("roundAdminEmails.email")
    .where("roundAdmins.roundId", "=", roundId);

  if (excludeAddress) {
    query = query.where(
      "roundAdmins.adminAddress",
      "!=",
      excludeAddress.toLowerCase(),
    );
  }

  const emails = await query.execute();
  return emails.map((e) => e.email);
}

export async function getChatMessageRecipients(
  projectId: number,
  roundId: number,
  senderAddress?: string,
): Promise<string[]> {
  const [projectEmails, roundAdminEmails] = await Promise.all([
    getProjectEmails(projectId),
    getRoundAdminEmailsExcludingAddress(roundId, senderAddress),
  ]);

  // Combine all emails and add hardcoded admin emails
  const allEmails = new Set([
    ...projectEmails,
    ...roundAdminEmails,
    ...ADMIN_NOTIFICATION_EMAILS,
  ]);

  return Array.from(allEmails);
}

export async function getAcceptedGranteeEmails(
  roundId: number,
): Promise<string[]> {
  // Get all project emails for projects with accepted applications in this round
  const emails = await db
    .selectFrom("applications")
    .innerJoin(
      "projectEmails",
      "applications.projectId",
      "projectEmails.projectId",
    )
    .select("projectEmails.email")
    .where("applications.roundId", "=", roundId)
    .where("applications.status", "=", "ACCEPTED")
    .execute();

  return [...new Set(emails.map((e) => e.email))];
}

export async function getAnnouncementRecipients(
  roundId: number,
  senderAddress?: string,
): Promise<string[]> {
  const [granteeEmails, roundAdminEmails] = await Promise.all([
    getAcceptedGranteeEmails(roundId),
    getRoundAdminEmailsExcludingAddress(roundId, senderAddress),
  ]);

  // Combine all emails and add hardcoded admin emails
  const allEmails = new Set([
    ...granteeEmails,
    ...roundAdminEmails,
    ...ADMIN_NOTIFICATION_EMAILS,
  ]);

  return Array.from(allEmails);
}

export async function sendApplicationSubmittedEmail(
  data: ApplicationSubmittedEmailData,
): Promise<void> {
  const { baseUrl, projectName, roundName, chainId, councilId } = data;

  const reviewLink = `${baseUrl}/flow-councils/review/${chainId}/${councilId}?tab=manage`;

  const subject = `Application Submitted - ${roundName}`;
  const body = `${projectName} submitted their application to ${roundName}. Start your review here: ${reviewLink}`;

  await sendEmail(ADMIN_NOTIFICATION_EMAILS, subject, body);
}

export async function sendApplicationStatusChangedEmail(
  recipients: string[],
  data: ApplicationStatusChangedEmailData,
): Promise<void> {
  const { baseUrl, roundName, chainId, councilId, projectId } = data;

  const projectLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=${projectId}`;

  const subject = `Application Status Change - ${roundName}`;
  const body = `The status of your application to ${roundName} has changed. Review your status and any comments here: ${projectLink}`;

  await sendEmail(recipients, subject, body);
}

export async function sendChatMessageEmail(
  recipients: string[],
  data: ChatMessageEmailData,
): Promise<void> {
  const { baseUrl, projectName, roundName, chainId, councilId, projectId } =
    data;

  const chatLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=${projectId}`;

  const subject = `New Message - #${projectName}`;
  const body = `There's a new message in the ${roundName} - ${projectName} chat: ${chatLink}`;

  await sendEmail(recipients, subject, body);
}

type AnnouncementEmailData = {
  baseUrl: string;
  roundName: string;
  chainId: number;
  councilId: string;
};

export async function sendAnnouncementEmail(
  recipients: string[],
  data: AnnouncementEmailData,
): Promise<void> {
  const { baseUrl, roundName, chainId, councilId } = data;

  const announcementLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=announcements`;

  const subject = `New Announcement - ${roundName}`;
  const body = `There's a new announcement in ${roundName}. View it here: ${announcementLink}`;

  await sendEmail(recipients, subject, body);
}

// Helper to get project and round details for email
export async function getProjectAndRoundDetails(
  projectId: number,
  roundId: number,
): Promise<{
  projectName: string;
  roundName: string;
  chainId: number;
  councilId: string;
} | null> {
  const [project, round] = await Promise.all([
    db
      .selectFrom("projects")
      .select("details")
      .where("id", "=", projectId)
      .executeTakeFirst(),
    db
      .selectFrom("rounds")
      .select(["details", "chainId", "flowCouncilAddress"])
      .where("id", "=", roundId)
      .executeTakeFirst(),
  ]);

  if (!project || !round) return null;

  const projectDetails =
    typeof project.details === "string"
      ? JSON.parse(project.details)
      : project.details;
  const roundDetails =
    typeof round.details === "string"
      ? JSON.parse(round.details)
      : round.details;

  return {
    projectName: projectDetails?.name || "Project",
    roundName: roundDetails?.name || "Round",
    chainId: round.chainId,
    councilId: round.flowCouncilAddress,
  };
}

export async function getRoundDetails(roundId: number): Promise<{
  roundName: string;
  chainId: number;
  councilId: string;
} | null> {
  const round = await db
    .selectFrom("rounds")
    .select(["details", "chainId", "flowCouncilAddress"])
    .where("id", "=", roundId)
    .executeTakeFirst();

  if (!round) return null;

  const roundDetails =
    typeof round.details === "string"
      ? JSON.parse(round.details)
      : round.details;

  return {
    roundName: roundDetails?.name || "Round",
    chainId: round.chainId,
    councilId: round.flowCouncilAddress,
  };
}
