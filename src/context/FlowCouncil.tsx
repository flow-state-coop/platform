"use client";

import { createContext, useContext, useReducer } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ProjectMetadata } from "@/types/project";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";
import useFlowCouncilQuery from "@/app/flow-councils/hooks/flowCouncilQuery";
import useBallotQuery from "@/app/flow-councils/hooks/ballotQuery";
import useVoterQuery from "@/app/flow-councils/hooks/voterQuery";
import useFlowStateProfilesQuery from "@/app/flow-councils/hooks/flowStateProfilesQuery";
import useFlowCouncilMetadata from "@/app/flow-councils/hooks/flowCouncilMetadata";
import useDistributionPoolQuery from "@/app/flow-councils/hooks/distributionPoolQuery";
import { Token } from "@/types/token";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type FlowCouncil = {
  id: string;
  metadata: string;
  distributionToken: `0x${string}`;
  recipients: {
    metadata: string;
    account: `0x${string}`;
    votes: { votedBy: string; amount: string; createdAtTimestamp: string };
  }[];
  maxAllocationsPerMember: number;
  pool: string;
};

type Voter = {
  account: `0x${string}`;
  votingPower: number;
};

type Ballot = { recipient: `0x${string}`; amount: number };

type FlowStateProfile = { id: string; metadata: ProjectMetadata };

type CurrentBallot = {
  ballot: Ballot[];
  votingPower: number;
};

type NewBallot = {
  ballot: Ballot[];
};

export const FlowCouncilContext = createContext<{
  flowCouncil?: FlowCouncil;
  flowCouncilMetadata: { name: string; description: string };
  voter?: Voter;
  currentBallot?: CurrentBallot;
  flowStateProfiles: FlowStateProfile[] | null;
  distributionPool?: GDAPool;
  token: Token;
  newBallot?: NewBallot;
  showBallot: boolean;
} | null>(null);

export const BallotDispatchContext = createContext<React.Dispatch<{
  type: string;
  ballot?: Ballot;
  currentBallot?: CurrentBallot;
}> | null>(null);

export const ShowBallotDispatchContext = createContext<React.Dispatch<{
  type: string;
}> | null>(null);

export function useFlowCouncilContext() {
  const context = useContext(FlowCouncilContext);

  if (!context) {
    throw Error("Council context was not found");
  }

  return context;
}

export function useBallotDispatchContext() {
  const context = useContext(BallotDispatchContext);

  if (!context) {
    throw Error("BallotDispatch context was not found");
  }

  return context;
}

export function useShowBallotDispatchContext() {
  const context = useContext(ShowBallotDispatchContext);

  if (!context) {
    throw Error("ShowBallotDispatch context was not found");
  }

  return context;
}

function showBallotReducer(
  showBallot: boolean,
  action: {
    type: string;
  },
) {
  switch (action.type) {
    case "show": {
      return true;
    }

    case "hide": {
      return false;
    }

    default: {
      throw Error(`Unknown action: ${action.type}`);
    }
  }
}

function newBallotReducer(
  newBallot: NewBallot,
  action: {
    type: string;
    currentBallot?: CurrentBallot;
    ballot?: Ballot;
  },
) {
  switch (action.type) {
    case "add": {
      if (!action.ballot) {
        if (!action.currentBallot) {
          return { ...newBallot };
        }

        return {
          ...newBallot,
          ballot: action.currentBallot.ballot,
        };
      }

      const nextBallot =
        action.currentBallot?.ballot &&
        (!newBallot?.ballot || newBallot.ballot.length === 0)
          ? [...action.currentBallot.ballot, action.ballot]
          : newBallot?.ballot
            ? [...newBallot.ballot, action.ballot]
            : [action.ballot];

      return { ...newBallot, ballot: nextBallot };
    }
    case "update": {
      const updatedBallot = [...newBallot.ballot];
      const index = newBallot.ballot.findIndex(
        (a) => a.recipient === action.ballot?.recipient,
      );

      if (index >= 0 && action.ballot) {
        updatedBallot[index] = action.ballot;
      }

      return { ...newBallot, ballot: updatedBallot };
    }
    case "delete": {
      return {
        ...newBallot,
        ballot: newBallot.ballot.filter(
          (a) => a.recipient !== action.ballot?.recipient,
        ),
      };
    }
    case "clear": {
      return {
        ballot: [],
      };
    }
    default: {
      throw Error(`Unknown action: ${action.type}`);
    }
  }
}

export function FlowCouncilContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address } = useAccount();
  const params = useParams();
  const chainId = params.chainId ? params.chainId.toString() : DEFAULT_CHAIN_ID;
  const flowCouncilId = params.id as string;
  const network =
    networks.find(
      (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
    ) ?? networks[0];
  const flowCouncil = useFlowCouncilQuery(network, flowCouncilId);
  const flowCouncilMetadata = useFlowCouncilMetadata(flowCouncil?.metadata);
  const flowStateProfiles = useFlowStateProfilesQuery(
    network,
    flowCouncil?.recipients,
  );
  const distributionPool = useDistributionPoolQuery(
    network,
    flowCouncil?.distributionPool,
  );
  const currentBallot = useBallotQuery(network, flowCouncilId, address ?? "");
  const voter = useVoterQuery(network, flowCouncilId, address ?? "");
  const token = network.tokens.find(
    (token) => token.address.toLowerCase() === flowCouncil?.distributionToken,
  ) ?? {
    address: distributionPool?.token.id ?? "0x",
    symbol: distributionPool?.token.symbol,
    icon: "",
  };

  const [newBallot, dispatchNewBallot] = useReducer(newBallotReducer, {
    ballot: [],
  });
  const [showBallot, dispatchShowBallot] = useReducer(showBallotReducer, false);

  return (
    <FlowCouncilContext.Provider
      value={{
        flowCouncil,
        flowCouncilMetadata,
        distributionPool,
        token,
        flowStateProfiles,
        voter,
        currentBallot,
        newBallot,
        showBallot,
      }}
    >
      <BallotDispatchContext.Provider value={dispatchNewBallot}>
        <ShowBallotDispatchContext.Provider value={dispatchShowBallot}>
          {children}
        </ShowBallotDispatchContext.Provider>
      </BallotDispatchContext.Provider>
    </FlowCouncilContext.Provider>
  );
}
