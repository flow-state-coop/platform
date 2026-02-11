"use client";

import { createContext, useContext, useReducer } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";
import useCouncilQuery from "@/app/flow-councils/hooks/councilQuery";
import useAllocationQuery from "@/app/flow-councils/hooks/allocationQuery";
import useCouncilMemberQuery from "@/app/flow-councils/hooks/councilMemberQuery";
import useRecipientsQuery from "@/app/flow-councils/hooks/recipientsQuery";
import useFlowCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useDistributionPoolQuery from "@/app/flow-councils/hooks/distributionPoolQuery";
import useSuperAppFundersQuery, {
  type SuperAppFunderData,
} from "@/app/flow-councils/hooks/superAppFundersQuery";
import { Token } from "@/types/token";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";
import {
  type FlowCouncilData,
  type CouncilMember,
  type CurrentAllocation,
  type NewAllocation,
  type AllocationAction,
  type ShowBallotAction,
} from "@/app/flow-councils/types/flowCouncil";

export const FlowCouncilContext = createContext<{
  council?: FlowCouncilData;
  councilMetadata: {
    name: string;
    description: string;
    logoUrl: string;
    superappSplitterAddress: string | null;
  };
  councilMember?: CouncilMember;
  currentAllocation?: CurrentAllocation;
  projects:
    | {
        id: string;
        fundingAddress: string;
        details: {
          name?: string;
          description?: string;
          logoUrl?: string;
          bannerUrl?: string;
          website?: string;
          twitter?: string;
          github?: string;
          karmaProfile?: string;
        };
      }[]
    | null;
  distributionPool?: GDAPool;
  superAppFunderData?: SuperAppFunderData;
  token: Token;
  newAllocation?: NewAllocation;
  showBallot: boolean;
} | null>(null);

export const AllocationDispatchContext =
  createContext<React.Dispatch<AllocationAction> | null>(null);

export const ShowBallotDispatchContext =
  createContext<React.Dispatch<ShowBallotAction> | null>(null);

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

function showBallotReducer(showBallot: boolean, action: ShowBallotAction) {
  switch (action.type) {
    case "show": {
      return true;
    }

    case "hide": {
      return false;
    }
  }
}

function newAllocationReducer(
  newAllocation: NewAllocation,
  action: AllocationAction,
) {
  switch (action.type) {
    case "add": {
      if (!action.allocation) {
        return action.currentAllocation
          ? {
              ...newAllocation,
              allocation: action.currentAllocation.allocation,
            }
          : { ...newAllocation };
      }

      const base =
        newAllocation.allocation.length > 0
          ? newAllocation.allocation
          : (action.currentAllocation?.allocation ?? []);

      return { ...newAllocation, allocation: [...base, action.allocation] };
    }
    case "update": {
      const updatedAllocation = [...newAllocation.allocation];
      const index = newAllocation.allocation.findIndex(
        (a) => a.recipient === action.allocation.recipient,
      );

      if (index >= 0) {
        updatedAllocation[index] = action.allocation;
      }

      return { ...newAllocation, allocation: updatedAllocation };
    }
    case "delete": {
      return {
        ...newAllocation,
        allocation: newAllocation.allocation.filter(
          (a) => a.recipient !== action.allocation.recipient,
        ),
      };
    }
    case "clear": {
      return {
        allocation: [],
      };
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
  const superAppFunderData = useSuperAppFundersQuery(
    network,
    councilMetadata.superappSplitterAddress,
    token.address,
  );

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
        superAppFunderData,
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
