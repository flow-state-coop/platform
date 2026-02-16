import type { ColumnType } from "kysely";
export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const ApplicationStatus = {
  INCOMPLETE: "INCOMPLETE",
  SUBMITTED: "SUBMITTED",
  ACCEPTED: "ACCEPTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  REJECTED: "REJECTED",
  REMOVED: "REMOVED",
  GRADUATED: "GRADUATED",
} as const;
export type ApplicationStatus =
  (typeof ApplicationStatus)[keyof typeof ApplicationStatus];
export const ChannelType = {
  INTERNAL_APPLICATION: "INTERNAL_APPLICATION",
  GROUP_ANNOUNCEMENTS: "GROUP_ANNOUNCEMENTS",
  GROUP_APPLICANTS: "GROUP_APPLICANTS",
  GROUP_GRANTEES: "GROUP_GRANTEES",
  GROUP_ROUND_ADMINS: "GROUP_ROUND_ADMINS",
  GROUP_PROJECT: "GROUP_PROJECT",
  PUBLIC_ROUND: "PUBLIC_ROUND",
  PUBLIC_PROJECT: "PUBLIC_PROJECT",
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];
export type Application = {
  id: Generated<number>;
  projectId: number;
  roundId: number;
  fundingAddress: string;
  status: Generated<ApplicationStatus>;
  details: unknown | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type Message = {
  id: Generated<number>;
  channelType: ChannelType;
  roundId: number | null;
  projectId: number | null;
  applicationId: number | null;
  authorAddress: string;
  content: string;
  messageType: Generated<string>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type MilestoneProgress = {
  id: Generated<number>;
  applicationId: number;
  milestoneType: string;
  milestoneIndex: number;
  progress: unknown | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type Project = {
  id: Generated<number>;
  details: unknown | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type ProjectEmail = {
  id: Generated<number>;
  projectId: number;
  email: string;
  managerAddress: string | null;
  createdAt: Generated<Timestamp>;
};
export type ProjectManager = {
  id: Generated<number>;
  projectId: number;
  managerAddress: string;
  createdAt: Generated<Timestamp>;
};
export type Recipient = {
  id: Generated<number>;
  applicationId: number;
  createdAt: Generated<Timestamp>;
};
export type Round = {
  id: Generated<number>;
  chainId: number;
  flowCouncilAddress: string;
  superappSplitterAddress: string | null;
  details: unknown | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type RoundAdmin = {
  id: Generated<number>;
  roundId: number;
  adminAddress: string;
  createdAt: Generated<Timestamp>;
};
export type RoundAdminEmail = {
  id: Generated<number>;
  roundAdminId: number;
  email: string;
  createdAt: Generated<Timestamp>;
};
export type RoundFeedRepost = {
  id: Generated<number>;
  messageId: number;
  roundId: number;
  createdAt: Generated<Timestamp>;
};
export type DB = {
  applications: Application;
  messages: Message;
  milestoneProgress: MilestoneProgress;
  projectEmails: ProjectEmail;
  projectManagers: ProjectManager;
  projects: Project;
  recipients: Recipient;
  roundAdminEmails: RoundAdminEmail;
  roundAdmins: RoundAdmin;
  roundFeedReposts: RoundFeedRepost;
  rounds: Round;
};
