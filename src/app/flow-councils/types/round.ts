export type IntegrationType =
  | "payments"
  | "identity"
  | "claimFlow"
  | "goodCollective"
  | "supertoken"
  | "activityFees"
  | "other";

export type BuildMilestone = {
  title: string;
  description: string;
  deliverables: string[];
};

export type GrowthMilestone = {
  title: string;
  description: string;
  activations: string[];
};

export type TeamMember = {
  name: string;
  roleDescription: string;
  telegram?: string;
  githubOrLinkedin?: string;
};

export type RoundForm = {
  previousParticipation: {
    hasParticipatedBefore: boolean | null;
    numberOfRounds: string;
    previousKarmaUpdates: string;
    currentProjectState: string;
  };
  maturityAndUsage: {
    projectStage: "early" | "live" | "mature" | null;
    lifetimeUsers: string;
    activeUsers: string;
    activeUsersFrequency: "daily" | "weekly" | "monthly";
    otherUsageData: string;
  };
  integration: {
    status: "live" | "ready" | "planned" | null;
    types: IntegrationType[];
    otherTypeExplanation: string;
    description: string;
  };
  buildGoals: {
    primaryBuildGoal: string;
    milestones: BuildMilestone[];
    ecosystemImpact: string;
  };
  growthGoals: {
    primaryGrowthGoal: string;
    targetUsers: string;
    milestones: GrowthMilestone[];
    ecosystemImpact: string;
  };
  team: {
    primaryContact: TeamMember;
    additionalTeammates: TeamMember[];
  };
  additional: {
    comments: string;
  };
};

export type RecipientType = "individual" | "organization";

export type AttestationForm = {
  commitment: {
    agreedToCommitments: boolean;
  };
  identity: {
    recipientType: RecipientType | null;
    legalName: string;
    country: string;
    address: string;
    contactEmail: string;
    fundingWallet: string;
    walletConfirmed: boolean;
  };
  dataAcknowledgement: {
    gdprConsent: boolean;
  };
  privacyTransparency: {
    agreedToPrivacy: boolean;
  };
};

export const INTEGRATION_TYPE_LABELS: Record<IntegrationType, string> = {
  payments: "Payments/rewards using G$",
  identity: "Identity",
  claimFlow: "Claim flow",
  goodCollective: "GoodCollective pools",
  supertoken: "G$ Supertoken/streaming",
  activityFees: "Activity fees --> UBI Pool",
  other: "Other",
};

export const PROJECT_STAGE_LABELS: Record<string, string> = {
  early: "Early stage",
  live: "Live product",
  mature: "Mature product with active users",
};

export const INTEGRATION_STATUS_LABELS: Record<string, string> = {
  live: "Live",
  ready: "Ready soon",
  planned: "Planned (eligible only if delivered)",
};

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily Active Users",
  weekly: "Weekly Active Users",
  monthly: "Monthly Active Users",
};

export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  individual: "Individual",
  organization: "Organization",
};

export const INITIAL_ROUND_FORM: RoundForm = {
  previousParticipation: {
    hasParticipatedBefore: null,
    numberOfRounds: "",
    previousKarmaUpdates: "",
    currentProjectState: "",
  },
  maturityAndUsage: {
    projectStage: null,
    lifetimeUsers: "",
    activeUsers: "",
    activeUsersFrequency: "weekly",
    otherUsageData: "",
  },
  integration: {
    status: null,
    types: [],
    otherTypeExplanation: "",
    description: "",
  },
  buildGoals: {
    primaryBuildGoal: "",
    milestones: [{ title: "", description: "", deliverables: [""] }],
    ecosystemImpact: "",
  },
  growthGoals: {
    primaryGrowthGoal: "",
    targetUsers: "",
    milestones: [{ title: "", description: "", activations: [""] }],
    ecosystemImpact: "",
  },
  team: {
    primaryContact: {
      name: "",
      roleDescription: "",
      telegram: "",
      githubOrLinkedin: "",
    },
    additionalTeammates: [],
  },
  additional: {
    comments: "",
  },
};

export const INITIAL_ATTESTATION_FORM: AttestationForm = {
  commitment: {
    agreedToCommitments: false,
  },
  identity: {
    recipientType: null,
    legalName: "",
    country: "",
    address: "",
    contactEmail: "",
    fundingWallet: "",
    walletConfirmed: false,
  },
  dataAcknowledgement: {
    gdprConsent: false,
  },
  privacyTransparency: {
    agreedToPrivacy: false,
  },
};
