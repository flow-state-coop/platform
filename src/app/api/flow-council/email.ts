import { SendTemplatedEmailCommand } from "@aws-sdk/client-ses";
import { sesClient, SES_FROM_EMAIL } from "./ses";
import { db } from "./db";

type ApplicationSubmittedEmailData = {
  baseUrl: string;
  projectName: string;
  roundName: string;
  chainId: number;
  councilId: string;
};

type ApplicationStatusChangedEmailData = {
  baseUrl: string;
  projectName: string;
  roundName: string;
  status: string;
  chainId: number;
  councilId: string;
  projectId: number;
};

type ChatMessageEmailData = {
  baseUrl: string;
  projectName: string;
  roundName: string;
  sender: string;
  messageContent: string;
  chainId: number;
  councilId: string;
  projectId: number;
};

type AnnouncementEmailData = {
  baseUrl: string;
  roundName: string;
  sender: string;
  messageContent: string;
  chainId: number;
  councilId: string;
};

async function sendTemplatedEmail(
  to: string[],
  templateName: string,
  templateData: Record<string, string>,
): Promise<void> {
  if (to.length === 0) return;

  try {
    const command = new SendTemplatedEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [SES_FROM_EMAIL],
        BccAddresses: to,
      },
      Template: templateName,
      TemplateData: JSON.stringify(templateData),
    });

    await sesClient.send(command);
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export async function getProjectEmails(
  projectId: number,
  excludeAddress?: string,
): Promise<string[]> {
  let query = db
    .selectFrom("projectEmails")
    .select("email")
    .where("projectId", "=", projectId);

  if (excludeAddress) {
    query = query.where((eb) =>
      eb.or([
        eb("managerAddress", "is", null),
        eb("managerAddress", "!=", excludeAddress.toLowerCase()),
      ]),
    );
  }

  const emails = await query.execute();
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
    getProjectEmails(projectId, senderAddress),
    getRoundAdminEmailsExcludingAddress(roundId, senderAddress),
  ]);

  // Combine all emails
  const allEmails = new Set([...projectEmails, ...roundAdminEmails]);

  return Array.from(allEmails);
}

export async function getAcceptedGranteeEmails(
  roundId: number,
  excludeAddress?: string,
): Promise<string[]> {
  // Get all project emails for projects with accepted applications in this round
  let query = db
    .selectFrom("applications")
    .innerJoin(
      "projectEmails",
      "applications.projectId",
      "projectEmails.projectId",
    )
    .select("projectEmails.email")
    .where("applications.roundId", "=", roundId)
    .where("applications.status", "=", "ACCEPTED");

  if (excludeAddress) {
    query = query.where((eb) =>
      eb.or([
        eb("projectEmails.managerAddress", "is", null),
        eb("projectEmails.managerAddress", "!=", excludeAddress.toLowerCase()),
      ]),
    );
  }

  const emails = await query.execute();
  return [...new Set(emails.map((e) => e.email))];
}

export async function getAnnouncementRecipients(
  roundId: number,
  senderAddress?: string,
): Promise<string[]> {
  const [granteeEmails, roundAdminEmails] = await Promise.all([
    getAcceptedGranteeEmails(roundId, senderAddress),
    getRoundAdminEmailsExcludingAddress(roundId, senderAddress),
  ]);

  // Combine all emails
  const allEmails = new Set([...granteeEmails, ...roundAdminEmails]);

  return Array.from(allEmails);
}

export async function sendApplicationSubmittedEmail(
  recipients: string[],
  data: ApplicationSubmittedEmailData,
): Promise<void> {
  const { baseUrl, projectName, roundName, chainId, councilId } = data;

  const ctaLink = `${baseUrl}/flow-councils/review/${chainId}/${councilId}?tab=manage`;
  const unsubLink = `${baseUrl}/flow-councils/application/${chainId}/${councilId}`;

  await sendTemplatedEmail(recipients, "flow-council-application-submitted", {
    projectName,
    roundName,
    ctaLink,
    unsubLink,
  });
}

export async function sendApplicationStatusChangedEmail(
  recipients: string[],
  data: ApplicationStatusChangedEmailData,
): Promise<void> {
  const {
    baseUrl,
    projectName,
    roundName,
    status,
    chainId,
    councilId,
    projectId,
  } = data;

  const ctaLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=${projectId}`;
  const unsubLink = `${baseUrl}/flow-councils/application/${chainId}/${councilId}`;

  await sendTemplatedEmail(recipients, "flow-council-application-status", {
    projectName,
    roundName,
    status,
    ctaLink,
    unsubLink,
  });
}

export async function sendChatMessageEmail(
  recipients: string[],
  data: ChatMessageEmailData,
): Promise<void> {
  const {
    baseUrl,
    projectName,
    roundName,
    sender,
    messageContent,
    chainId,
    councilId,
    projectId,
  } = data;

  const ctaLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=${projectId}`;
  const unsubLink = `${baseUrl}/flow-councils/application/${chainId}/${councilId}`;

  await sendTemplatedEmail(recipients, "flow-council-message", {
    projectName,
    roundName,
    sender,
    messageContent,
    ctaLink,
    unsubLink,
  });
}

export async function sendAnnouncementEmail(
  recipients: string[],
  data: AnnouncementEmailData,
): Promise<void> {
  const { baseUrl, roundName, sender, messageContent, chainId, councilId } =
    data;

  const ctaLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=announcements`;
  const unsubLink = `${baseUrl}/flow-councils/application/${chainId}/${councilId}`;

  await sendTemplatedEmail(recipients, "flow-council-announcement", {
    roundName,
    sender,
    messageContent,
    ctaLink,
    unsubLink,
  });
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
