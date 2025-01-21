export type GDAPool = {
  id: `0x${string}`;
  flowRate: `${number}`;
  adjustmentFlowRate: `${number}`;
  totalAmountFlowedDistributedUntilUpdatedAt: `${number}`;
  updatedAtTimestamp: number;
  totalUnits: `${number}`;
  token: { id: `0x${string}`; symbol: string };
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
