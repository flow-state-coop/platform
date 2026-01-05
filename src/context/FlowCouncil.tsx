"use client";

import { createContext, useContext, useReducer } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ProjectMetadata } from "@/types/project";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";
import useCouncilQuery from "@/app/flow-councils/hooks/councilQuery";
import useAllocationQuery from "@/app/flow-councils/hooks/allocationQuery";
import useCouncilMemberQuery from "@/app/flow-councils/hooks/councilMemberQuery";
import useRecipientsQuery from "@/app/flow-councils/hooks/recipientsQuery";
import useFlowCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useDistributionPoolQuery from "@/app/flow-councils/hooks/distributionPoolQuery";
import { Token } from "@/types/token";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type FlowCouncil = {
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

type CouncilMember = {
  account: `0x${string}`;
  votingPower: number;
};

type Allocation = { recipient: `0x${string}`; amount: number };

type CurrentAllocation = {
  allocation: Allocation[];
  votingPower: number;
};

type NewAllocation = {
  allocation: Allocation[];
};

export const FlowCouncilContext = createContext<{
  council?: FlowCouncil;
  councilMetadata: { name: string; description: string; logoUrl: string };
  councilMember?: CouncilMember;
  currentAllocation?: CurrentAllocation;
  projects: { id: string; metadata: ProjectMetadata }[] | null;
  distributionPool?: GDAPool;
  token: Token;
  newAllocation?: NewAllocation;
  showBallot: boolean;
} | null>(null);

export const AllocationDispatchContext = createContext<React.Dispatch<{
  type: string;
  allocation?: Allocation;
  currentAllocation?: CurrentAllocation;
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

export function useAllocationDispatchContext() {
  const context = useContext(AllocationDispatchContext);

  if (!context) {
    throw Error("AllocationDispatch context was not found");
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

function newAllocationReducer(
  newAllocation: NewAllocation,
  action: {
    type: string;
    currentAllocation?: CurrentAllocation;
    allocation?: Allocation;
  },
) {
  switch (action.type) {
    case "add": {
      if (!action.allocation) {
        if (!action.currentAllocation) {
          return { ...newAllocation };
        }

        return {
          ...newAllocation,
          allocation: action.currentAllocation.allocation,
        };
      }

      const nextAllocation =
        action.currentAllocation?.allocation &&
        (!newAllocation?.allocation || newAllocation.allocation.length === 0)
          ? [...action.currentAllocation.allocation, action.allocation]
          : newAllocation?.allocation
            ? [...newAllocation.allocation, action.allocation]
            : [action.allocation];

      return { ...newAllocation, allocation: nextAllocation };
    }
    case "update": {
      const updatedAllocation = [...newAllocation.allocation];
      const index = newAllocation.allocation.findIndex(
        (a) => a.recipient === action.allocation?.recipient,
      );

      if (index >= 0 && action.allocation) {
        updatedAllocation[index] = action.allocation;
      }

      return { ...newAllocation, allocation: updatedAllocation };
    }
    case "delete": {
      return {
        ...newAllocation,
        allocation: newAllocation.allocation.filter(
          (a) => a.recipient !== action.allocation?.recipient,
        ),
      };
    }
    case "clear": {
      return {
        allocation: [],
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
  const councilId = params.councilId as string;
  const network =
    networks.find(
      (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
    ) ?? networks[0];
  const council = useCouncilQuery(network, councilId);
  const councilMetadata = useFlowCouncilMetadata(Number(chainId), councilId);
  const projects = useRecipientsQuery(network, council?.recipients, councilId);
  const distributionPool = useDistributionPoolQuery(
    network,
    council?.distributionPool,
  );
  const currentAllocation = useAllocationQuery(
    network,
    councilId,
    address ?? "",
  );
  const councilMember = useCouncilMemberQuery(
    network,
    councilId,
    address ?? "",
  );
  const token = network.tokens.find(
    (token) => token.address.toLowerCase() === council?.superToken,
  ) ?? {
    address: distributionPool?.token.id ?? "0x",
    symbol: distributionPool?.token.symbol,
    icon: "",
  };

  const [newAllocation, dispatchNewAllocation] = useReducer(
    newAllocationReducer,
    {
      allocation: [],
    },
  );
  const [showBallot, dispatchShowBallot] = useReducer(showBallotReducer, false);

  return (
    <FlowCouncilContext.Provider
      value={{
        council,
        councilMetadata,
        distributionPool,
        token,
        projects,
        councilMember,
        currentAllocation,
        newAllocation,
        showBallot,
      }}
    >
      <AllocationDispatchContext.Provider value={dispatchNewAllocation}>
        <ShowBallotDispatchContext.Provider value={dispatchShowBallot}>
          {children}
        </ShowBallotDispatchContext.Provider>
      </AllocationDispatchContext.Provider>
    </FlowCouncilContext.Provider>
  );
}
