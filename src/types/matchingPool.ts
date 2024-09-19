export type MatchingPool = {
  id: `0x${string}`;
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
    totalAmountReceivedUntilUpdatedAt: `${number}`;
    updatedAtTimestamp: number;
    isConnected: boolean;
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
