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

export type Vote = { recipient: `0x${string}`; amount: number };

export type CurrentBallot = {
  votes: Vote[];
  votingPower: number;
};

export type NewBallot = {
  votes: Vote[];
};

export type BallotAction =
  | {
      type: "add";
      vote?: Vote;
      currentBallot?: CurrentBallot;
    }
  | { type: "update"; vote: Vote }
  | { type: "delete"; vote: Vote }
  | { type: "clear" };

export type ShowBallotAction = { type: "show" } | { type: "hide" };

export type { CouncilMember };
