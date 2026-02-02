import { Address } from "viem";

export type RecipientMetadata = {
  title: string;
  description: string;
  website: string;
  logoImg: string;
  bannerImg: string;
  projectTwitter: string;
  projectWarpcast: string;
};

export type Recipient = {
  id: Address;
  recipientAddress: Address;
  superappAddress: Address;
  metadata: RecipientMetadata;
};
