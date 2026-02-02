export type SmartContract = {
  type: "projectAddress" | "goodCollectivePool";
  network: string;
  address: string;
};

export type OtherLink = {
  description: string;
  url: string;
};

export type ProjectDetails = {
  name?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  github?: string;
  defaultFundingAddress?: string;
  demoUrl?: string;
  farcaster?: string;
  telegram?: string;
  discord?: string;
  karmaGap?: string;
  githubRepos?: string[];
  smartContracts?: SmartContract[];
  otherLinks?: OtherLink[];
};

export type Project = {
  id: number;
  details: ProjectDetails | null;
  createdAt: string;
  updatedAt: string;
};
