"use client";

import { createContext, useContext, useReducer } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ProjectMetadata } from "@/types/project";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";
import useCouncilQuery from "@/app/flow-councils/hooks/councilQuery";
import useAllocationQuery from "@/app/flow-councils/hooks/allocationQuery";
import useFlowStateProfilesQuery from "@/app/flow-councils/hooks/flowStateProfilesQuery";
import useFlowCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useGdaPoolQuery from "@/app/flow-councils/hooks/gdaPoolQuery";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type Council = {
  id: string;
  councilMembers: {
    account: `0x${string}`;
    votingPower: number;
  }[];
  metadata: string;
  grantees: { metadata: string; account: `0x${string}` }[];
  maxAllocationsPerMember: number;
  pool: string;
};

type Allocation = { grantee: string; amount: number };

type FlowStateProfile = { id: string; metadata: ProjectMetadata };

type CurrentAllocation = {
  allocation: Allocation[];
  votingPower: number;
};

type NewAllocation = {
  showBallot: boolean;
  allocation: Allocation[];
};

export const FlowCouncilContext = createContext<{
  council?: Council;
  councilMetadata: { name: string; description: string };
  currentAllocation?: CurrentAllocation;
  flowStateProfiles?: FlowStateProfile[];
  gdaPool?: GDAPool;
  newAllocation?: NewAllocation;
} | null>(null);

export const AllocationDispatchContext = createContext<React.Dispatch<{
  type: string;
  allocation?: Allocation;
  currentAllocation?: CurrentAllocation;
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
          showBallot: true,
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
        (a) => a.grantee === action.allocation?.grantee,
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
          (a) => a.grantee !== action.allocation?.grantee,
        ),
      };
    }
    case "show-ballot": {
      return { ...newAllocation, showBallot: true };
    }
    case "hide-ballot": {
      return { ...newAllocation, showBallot: false };
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
  const chainId = params.chainId;
  const councilId = params.councilId as string;
  const network =
    networks.find(
      (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
    ) ?? networks[0];
  const council = useCouncilQuery(network, councilId);
  const councilMetadata = useFlowCouncilMetadata(council?.metadata);
  const flowStateProfiles = useFlowStateProfilesQuery(
    network,
    council?.grantees,
  );
  const gdaPool = useGdaPoolQuery(network, council?.pool);
  const currentAllocation = useAllocationQuery(
    network,
    councilId,
    address ?? "",
  );
  const [newAllocation, dispatch] = useReducer(newAllocationReducer, {
    showBallot: false,
    allocation: [],
  });

  return (
    <FlowCouncilContext.Provider
      value={{
        council,
        councilMetadata,
        gdaPool,
        flowStateProfiles,
        currentAllocation,
        newAllocation,
      }}
    >
      <AllocationDispatchContext.Provider value={dispatch}>
        {children}
      </AllocationDispatchContext.Provider>
    </FlowCouncilContext.Provider>
  );
}
