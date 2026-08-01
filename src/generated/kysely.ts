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
  editsUnlocked: Generated<boolean>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type BotChainLock = {
  chainId: number;
  holder: string | null;
  acquiredAt: Timestamp | null;
  expiresAt: Timestamp | null;
  lastNonce: string | null;
  lastNonceAt: Timestamp | null;
};
export type InboxItem = {
  id: Generated<number>;
  recipientAddress: string;
  messageId: number | null;
  applicationId: number | null;
  category: string;
  sourceLabel: string | null;
  snippet: string | null;
  readAt: Timestamp | null;
  createdAt: Generated<Timestamp>;
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
  pinnedAt: Timestamp | null;
  pinnedBy: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type MessageReaction = {
  id: Generated<number>;
  messageId: number;
  authorAddress: string;
  emoji: string;
  createdAt: Generated<Timestamp>;
};
export type MetricsApiKey = {
  id: Generated<number>;
  roundId: number;
  voterGroupId: number;
  keyHash: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: Timestamp | null;
  cooldownUntil: Timestamp | null;
  revokedAt: Timestamp | null;
  createdAt: Generated<Timestamp>;
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
  applicationsClosed: Generated<boolean>;
  details: unknown | null;
  lastClaimAt: Timestamp | null;
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
export type SplitterApiKey = {
  id: Generated<number>;
  chainId: number;
  poolId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  createdBy: string | null;
  lastUsedAt: Timestamp | null;
  cooldownUntil: Timestamp | null;
  revokedAt: Timestamp | null;
  createdAt: Generated<Timestamp>;
};
export type SplitterIntegration = {
  chainId: number;
  poolId: string;
  lastWriteAt: Timestamp | null;
  createdAt: Generated<Timestamp>;
};
export type SplitterUnlockPayment = {
  id: Generated<number>;
  chainId: number;
  poolId: string;
  txHash: string;
  payer: string;
  token: string;
  amount: string;
  createdAt: Generated<Timestamp>;
};
export type SplitterWriteHistory = {
  id: Generated<number>;
  chainId: number;
  poolId: string;
  keyId: number | null;
  jobId: string | null;
  changedCount: number;
  status: string;
  txHashes: Generated<string[]>;
  gasUsed: string | null;
  gasCostWei: string | null;
  createdAt: Generated<Timestamp>;
};
export type SplitterWriteJob = {
  id: string;
  chainId: number;
  poolId: string;
  keyId: number;
  payloadHash: string;
  status: string;
  target: unknown;
  batchIndex: Generated<number>;
  txHashes: Generated<string[]>;
  changedCount: Generated<number>;
  gasUsed: Generated<string>;
  gasCostWei: Generated<string>;
  attempt: Generated<number>;
  heartbeatAt: Generated<Timestamp>;
  error: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  expiresAt: Timestamp;
};
export type SplitterWrittenRegister = {
  chainId: number;
  poolId: string;
  address: string;
  units: string;
  updatedAt: Generated<Timestamp>;
};
export type UserProfile = {
  id: Generated<number>;
  address: string;
  displayName: string;
  bio: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  farcaster: string | null;
  email: string | null;
  telegram: string | null;
  notifyApplicationEligibility: Generated<boolean>;
  notifyProjectChannels: Generated<boolean>;
  notifyRoundAnnouncements: Generated<boolean>;
  notifyInternalReview: Generated<boolean>;
  notifyPlatform: Generated<boolean>;
  consentConfirmedAt: Timestamp | null;
  consentVersion: string | null;
  emailVersion: Generated<number>;
  emailSuspendedAt: Timestamp | null;
  emailSuspensionReason: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type VoterGroup = {
  id: Generated<number>;
  roundId: number;
  name: string;
  eligibilityMethod: string;
  defaultVotingPower: Generated<number>;
  lastBallotAt: Timestamp | null;
  nftContractAddress: string | null;
  nftTokenStandard: string | null;
  nftTokenId: string | null;
  nftAcquisitionUrl: string | null;
  nftCollectionName: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
};
export type VoterGroupMember = {
  id: Generated<number>;
  voterGroupId: number;
  roundId: number;
  address: string;
  createdAt: Generated<Timestamp>;
};
export type DB = {
  applications: Application;
  botChainLocks: BotChainLock;
  inboxItems: InboxItem;
  messageReactions: MessageReaction;
  messages: Message;
  metricsApiKeys: MetricsApiKey;
  milestoneProgress: MilestoneProgress;
  projectEmails: ProjectEmail;
  projectManagers: ProjectManager;
  projects: Project;
  recipients: Recipient;
  roundAdminEmails: RoundAdminEmail;
  roundAdmins: RoundAdmin;
  rounds: Round;
  splitterApiKeys: SplitterApiKey;
  splitterIntegrations: SplitterIntegration;
  splitterUnlockPayments: SplitterUnlockPayment;
  splitterWriteHistory: SplitterWriteHistory;
  splitterWriteJobs: SplitterWriteJob;
  splitterWrittenRegister: SplitterWrittenRegister;
  userProfiles: UserProfile;
  voterGroupMembers: VoterGroupMember;
  voterGroups: VoterGroup;
};
