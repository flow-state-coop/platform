"use client";

import { createContext, useContext, useReducer } from "react";
import { usePathname, useParams, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ProjectMetadata } from "@/types/project";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";
import useCouncilQuery from "@/app/flow-councils/hooks/councilQuery";
import useAllocationQuery from "@/app/flow-councils/hooks/allocationQuery";
import useCouncilMemberQuery from "@/app/flow-councils/hooks/councilMemberQuery";
import useFlowStateProfilesQuery from "@/app/flow-councils/hooks/flowStateProfilesQuery";
import useFlowCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useGdaPoolQuery from "@/app/flow-councils/hooks/gdaPoolQuery";
import { Token } from "@/types/token";
import { councilConfig as goodDollarCouncilConfig } from "@/app/gooddollar/lib/councilConfig";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type Council = {
  id: string;
  metadata: string;
  distributionToken: `0x${string}`;
  grantees: {
    metadata: string;
    account: `0x${string}`;
    votes: { votedBy: string; amount: string; createdAtTimestamp: string };
  }[];
  maxAllocationsPerMember: number;
  pool: string;
};

type CouncilMember = {
  account: `0x${string}`;
  votingPower: number;
};

type Allocation = { grantee: `0x${string}`; amount: number };

type FlowStateProfile = { id: string; metadata: ProjectMetadata };

type CurrentAllocation = {
  allocation: Allocation[];
  votingPower: number;
};

type NewAllocation = {
  allocation: Allocation[];
};

export const FlowCouncilContext = createContext<{
  council?: Council;
  councilMetadata: { name: string; description: string };
  councilMember?: CouncilMember;
  currentAllocation?: CurrentAllocation;
  flowStateProfiles: FlowStateProfile[] | null;
  gdaPool?: GDAPool;
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
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const chainId =
    pathname.startsWith("/gooddollar") && searchParams.get("chainId")
      ? searchParams.get("chainId")
      : pathname.startsWith("/gooddollar")
        ? 42220
        : params.chainId
          ? params.chainId.toString()
          : DEFAULT_CHAIN_ID;
  const councilId =
    pathname.startsWith("/gooddollar") &&
    chainId &&
    goodDollarCouncilConfig[chainId]?.councilAddress
      ? goodDollarCouncilConfig[chainId].councilAddress
      : (params.councilId as string);
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
  const councilMember = useCouncilMemberQuery(
    network,
    councilId,
    address ?? "",
  );
  const token = network.tokens.find(
    (token) => token.address.toLowerCase() === council?.distributionToken,
  ) ?? {
    address: gdaPool?.token.id ?? "0x",
    symbol: gdaPool?.token.symbol,
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
        gdaPool,
        token,
        flowStateProfiles,
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
