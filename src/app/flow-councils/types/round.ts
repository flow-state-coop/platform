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
