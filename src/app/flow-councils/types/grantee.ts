import { ProjectMetadata } from "@/types/project";

export type Grantee = {
  id: string;
  address: string;
  metadata: ProjectMetadata;
  bannerCid: string;
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
