import { type CouncilMember } from "./councilMember";

export type FlowCouncilData = {
  id: string;
  metadata: string;
  superToken: `0x${string}`;
  recipients: {
    metadata: string;
    account: `0x${string}`;
    votes: { votedBy: string; amount: string; createdAtTimestamp: string };
  }[];
  maxVotingSpread: number;
  distributionPool: string;
};

export type FlowCouncilListing = {
  id: string;
  superToken: string;
  isManager: boolean;
  isRecipient: boolean;
  distributionPool: string;
  isConnected: boolean;
  units: bigint;
  metadata: { name: string; description: string };
};

export type Allocation = { recipient: `0x${string}`; amount: number };

export type CurrentAllocation = {
  allocation: Allocation[];
  votingPower: number;
};

export type NewAllocation = {
  allocation: Allocation[];
};

export type AllocationAction =
  | {
      type: "add";
      allocation?: Allocation;
      currentAllocation?: CurrentAllocation;
    }
  | { type: "update"; allocation: Allocation }
  | { type: "delete"; allocation: Allocation }
  | { type: "clear" };

export type ShowBallotAction = { type: "show" } | { type: "hide" };

export type { CouncilMember };
