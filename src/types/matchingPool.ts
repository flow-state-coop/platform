export type MatchingPool = {
  flowRate: `${number}`;
  adjustmentFlowRate: `${number}`;
  totalAmountFlowedDistributedUntilUpdatedAt: `${number}`;
  updatedAtTimestamp: number;
  totalUnits: `${number}`;
  poolMembers: {
    account: {
      id: `0x${string}`;
    };
    units: `${number}`;
    totalAmountClaimed: `${number}`;
    updatedAtTimestamp: number;
  }[];
  poolDistributors: {
    account: {
      id: `0x${string}`;
    };
    flowRate: `${number}`;
    totalAmountFlowedDistributedUntilUpdatedAt: `${number}`;
    updatedAtTimestamp: number;
  }[];
};
