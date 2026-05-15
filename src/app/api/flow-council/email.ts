import removeMarkdown from "remove-markdown";
import {
  sendPersonalizedEmail,
  type PersonalizedRecipient,
} from "./ses";
import { db } from "./db";
import { generateNotificationToken } from "@/lib/notificationToken";
import type { NotificationCategory } from "@/lib/consent";

export type ResolvedRecipient = PersonalizedRecipient & {
  emailVersion: number;
};

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

type InternalCommentEmailData = {
  baseUrl: string;
  projectName: string;
  roundName: string;
  sender: string;
  messageContent: string;
  chainId: number;
  councilId: string;
  applicationId: number;
};

type NotifyColumn =
  | "notifyApplicationEligibility"
  | "notifyProjectChannels"
  | "notifyRoundAnnouncements"
  | "notifyInternalReview"
  | "notifyPlatform";

function notifyColumnFor(category: NotificationCategory): NotifyColumn {
  switch (category) {
    case "application_eligibility":
      return "notifyApplicationEligibility";
    case "project_channels":
      return "notifyProjectChannels";
    case "round_announcements":
      return "notifyRoundAnnouncements";
    case "internal_review":
      return "notifyInternalReview";
    case "platform":
      return "notifyPlatform";
  }
}

function toResolvedRecipients(
  rows: Array<{ address: string; email: string | null; emailVersion: number }>,
): ResolvedRecipient[] {
  const out: ResolvedRecipient[] = [];
  for (const row of rows) {
    if (!row.email) continue;
    const token = generateNotificationToken(row.address, row.emailVersion);
    out.push({
      address: row.address,
      email: row.email,
      emailVersion: row.emailVersion,
      unsubToken: token,
      prefsToken: token,
    });
  }
  return out;
}

export async function resolveProjectManagerRecipients(
  projectId: number,
  category: NotificationCategory,
  excludeAddress?: string,
): Promise<ResolvedRecipient[]> {
  const col = notifyColumnFor(category);
  let q = db
    .selectFrom("projectManagers")
    .innerJoin(
      "userProfiles",
      "userProfiles.address",
      "projectManagers.managerAddress",
    )
    .select([
      "userProfiles.address",
      "userProfiles.email",
      "userProfiles.emailVersion",
    ])
    .where("projectManagers.projectId", "=", projectId)
    .where("userProfiles.email", "is not", null)
    .where("userProfiles.consentConfirmedAt", "is not", null)
    .where("userProfiles.emailSuspendedAt", "is", null)
    .where(`userProfiles.${col}`, "=", true);
  if (excludeAddress) {
    q = q.where(
      "projectManagers.managerAddress",
      "!=",
      excludeAddress.toLowerCase(),
    );
  }
  const rows = await q.execute();
  return toResolvedRecipients(rows);
}

export async function resolveProjectManagerAddresses(
  projectId: number,
  excludeAddress?: string,
): Promise<string[]> {
  let q = db
    .selectFrom("projectManagers")
    .select("managerAddress")
    .where("projectId", "=", projectId);
  if (excludeAddress) {
    q = q.where("managerAddress", "!=", excludeAddress.toLowerCase());
  }
  const rows = await q.execute();
  return rows.map((r) => r.managerAddress);
}

export async function resolveRoundAdminRecipients(
  roundId: number,
  category: NotificationCategory,
  excludeAddress?: string,
): Promise<ResolvedRecipient[]> {
  const col = notifyColumnFor(category);
  let q = db
    .selectFrom("roundAdmins")
    .innerJoin(
      "userProfiles",
      "userProfiles.address",
      "roundAdmins.adminAddress",
    )
    .select([
      "userProfiles.address",
      "userProfiles.email",
      "userProfiles.emailVersion",
    ])
    .where("roundAdmins.roundId", "=", roundId)
    .where("userProfiles.email", "is not", null)
    .where("userProfiles.consentConfirmedAt", "is not", null)
    .where("userProfiles.emailSuspendedAt", "is", null)
    .where(`userProfiles.${col}`, "=", true);
  if (excludeAddress) {
    q = q.where(
      "roundAdmins.adminAddress",
      "!=",
      excludeAddress.toLowerCase(),
    );
  }
  const rows = await q.execute();
  return toResolvedRecipients(rows);
}

export async function resolveRoundAdminAddresses(
  roundId: number,
  excludeAddress?: string,
): Promise<string[]> {
  let q = db
    .selectFrom("roundAdmins")
    .select("adminAddress")
    .where("roundId", "=", roundId);
  if (excludeAddress) {
    q = q.where("adminAddress", "!=", excludeAddress.toLowerCase());
  }
  const rows = await q.execute();
  return rows.map((r) => r.adminAddress);
}

export async function resolveAcceptedGranteeRecipients(
  roundId: number,
  category: NotificationCategory,
  excludeAddress?: string,
): Promise<ResolvedRecipient[]> {
  const col = notifyColumnFor(category);
  let q = db
    .selectFrom("applications")
    .innerJoin(
      "projectManagers",
      "projectManagers.projectId",
      "applications.projectId",
    )
    .innerJoin(
      "userProfiles",
      "userProfiles.address",
      "projectManagers.managerAddress",
    )
    .select([
      "userProfiles.address",
      "userProfiles.email",
      "userProfiles.emailVersion",
    ])
    .distinct()
    .where("applications.roundId", "=", roundId)
    .where("applications.status", "=", "ACCEPTED")
    .where("userProfiles.email", "is not", null)
    .where("userProfiles.consentConfirmedAt", "is not", null)
    .where("userProfiles.emailSuspendedAt", "is", null)
    .where(`userProfiles.${col}`, "=", true);
  if (excludeAddress) {
    q = q.where(
      "projectManagers.managerAddress",
      "!=",
      excludeAddress.toLowerCase(),
    );
  }
  const rows = await q.execute();
  return toResolvedRecipients(rows);
}

export async function resolveAcceptedGranteeAddresses(
  roundId: number,
  excludeAddress?: string,
): Promise<string[]> {
  let q = db
    .selectFrom("applications")
    .innerJoin(
      "projectManagers",
      "projectManagers.projectId",
      "applications.projectId",
    )
    .select("projectManagers.managerAddress")
    .distinct()
    .where("applications.roundId", "=", roundId)
    .where("applications.status", "=", "ACCEPTED");
  if (excludeAddress) {
    q = q.where(
      "projectManagers.managerAddress",
      "!=",
      excludeAddress.toLowerCase(),
    );
  }
  const rows = await q.execute();
  return rows.map((r) => r.managerAddress);
}

export async function resolvePlatformRecipients(): Promise<ResolvedRecipient[]> {
  const rows = await db
    .selectFrom("userProfiles")
    .select(["address", "email", "emailVersion"])
    .where("email", "is not", null)
    .where("consentConfirmedAt", "is not", null)
    .where("emailSuspendedAt", "is", null)
    .where("notifyPlatform", "=", true)
    .execute();
  return toResolvedRecipients(rows);
}

// Unfiltered counterpart to resolvePlatformRecipients: every user with a
// profile, ignoring email/consent/suspension/preference. Used for the inbox
// leg of platform messages so opting out of platform *email* doesn't also
// suppress the in-app inbox item — matching the resolve*Addresses() pattern
// the other notification paths use for their inbox writes.
export async function resolvePlatformAddresses(): Promise<string[]> {
  const rows = await db
    .selectFrom("userProfiles")
    .select("address")
    .execute();
  return rows.map((r) => r.address);
}

async function sendPersonalizedBatch(
  recipients: ResolvedRecipient[],
  templateName: string,
  templateData: Record<string, string>,
  baseUrl: string,
): Promise<void> {
  if (recipients.length === 0) return;
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendPersonalizedEmail(r, templateName, templateData, baseUrl),
    ),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("Personalized email send failed:", r.reason);
    }
  }
}

export async function sendApplicationSubmittedEmail(
  recipients: ResolvedRecipient[],
  data: ApplicationSubmittedEmailData,
): Promise<void> {
  const { baseUrl, projectName, roundName, chainId, councilId } = data;
  const ctaLink = `${baseUrl}/flow-councils/review/${chainId}/${councilId}?tab=manage`;
  await sendPersonalizedBatch(
    recipients,
    "flow-council-application-submitted",
    {
      projectName,
      roundName,
      ctaLink,
    },
    baseUrl,
  );
}

export async function sendApplicationStatusChangedEmail(
  recipients: ResolvedRecipient[],
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
  await sendPersonalizedBatch(
    recipients,
    "flow-council-application-status",
    {
      projectName,
      roundName,
      status,
      ctaLink,
    },
    baseUrl,
  );
}

export async function sendChatMessageEmail(
  recipients: ResolvedRecipient[],
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
  await sendPersonalizedBatch(
    recipients,
    "flow-council-message",
    {
      projectName,
      roundName,
      sender,
      messageContent: removeMarkdown(messageContent),
      ctaLink,
    },
    baseUrl,
  );
}

export async function sendAnnouncementEmail(
  recipients: ResolvedRecipient[],
  data: AnnouncementEmailData,
): Promise<void> {
  const { baseUrl, roundName, sender, messageContent, chainId, councilId } =
    data;
  const ctaLink = `${baseUrl}/flow-councils/communications/${chainId}/${councilId}?channel=announcements`;
  await sendPersonalizedBatch(
    recipients,
    "flow-council-announcement",
    {
      roundName,
      sender,
      messageContent: removeMarkdown(messageContent),
      ctaLink,
    },
    baseUrl,
  );
}

export async function sendInternalCommentEmail(
  recipients: ResolvedRecipient[],
  data: InternalCommentEmailData,
): Promise<void> {
  const {
    baseUrl,
    projectName,
    roundName,
    sender,
    messageContent,
    chainId,
    councilId,
    applicationId,
  } = data;
  const ctaLink = `${baseUrl}/flow-councils/review/${chainId}/${councilId}?application=${applicationId}`;
  await sendPersonalizedBatch(
    recipients,
    "flow-council-internal-comment",
    {
      project_name: projectName,
      round_name: roundName,
      sender,
      message_content: removeMarkdown(messageContent),
      ctaLink,
    },
    baseUrl,
  );
}

type PlatformMessageData = {
  baseUrl: string;
  subject: string;
  content: string;
};

export async function sendPlatformMessageEmail(
  recipients: ResolvedRecipient[],
  data: PlatformMessageData,
): Promise<void> {
  const { baseUrl, subject, content } = data;
  await sendPersonalizedBatch(
    recipients,
    "flow-state-platform-message",
    {
      subject,
      content: removeMarkdown(content),
    },
    baseUrl,
  );
}

export function formatSender(
  address: string,
  displayName: string | undefined,
): string {
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return displayName ? `${displayName} (${short})` : short;
}

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

