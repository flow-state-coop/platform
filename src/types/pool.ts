export type Pool = {
  strategyAddress: string;
  chainId: number;
  allocationToken: string;
  matchingToken: string;
  metadata: PoolMetadata;
};

export type PoolMetadata = {
  name: string;
  description: string;
  flowStateEligibility?: boolean;
  nftMintUrl?: string;
};
