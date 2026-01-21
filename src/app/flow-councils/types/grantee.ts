export type ProjectDetails = {
  name?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  github?: string;
  karmaGap?: string;
};

export type Grantee = {
  id: string;
  address: `0x${string}`;
  details: ProjectDetails;
  twitter: string;
  flowRate: bigint;
  units: number;
  placeholderLogo: string;
  placeholderBanner: string;
};

export enum SortingMethod {
  RANDOM = "Random Order",
  ALPHABETICAL = "Alphabetical",
  POPULAR = "Popular",
}
