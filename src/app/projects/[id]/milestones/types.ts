export type EvidenceLink = {
  name: string;
  link: string;
};

export type DeliverableProgress = {
  completion: number;
  evidence: EvidenceLink[];
};

export type MilestoneProgressData = {
  otherDetails: string;
  items: DeliverableProgress[];
};

export type MilestoneWithProgress = {
  type: "build" | "growth";
  index: number;
  title: string;
  description: string;
  itemNames: string[];
  progress: MilestoneProgressData;
};

export type ApplicationMilestones = {
  applicationId: number;
  roundName: string;
  milestones: MilestoneWithProgress[];
};
