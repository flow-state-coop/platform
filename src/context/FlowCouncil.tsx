"use client";

import { createContext, useContext, useReducer, useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { GDAPool } from "@/types/gdaPool";
import { networks } from "@/lib/networks";
import useCouncilQuery from "@/app/flow-councils/hooks/councilQuery";
import useBallotQuery from "@/app/flow-councils/hooks/ballotQuery";
import useCouncilMemberQuery from "@/app/flow-councils/hooks/councilMemberQuery";
import useRecipientsQuery from "@/app/flow-councils/hooks/recipientsQuery";
import useFlowCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useDistributionPoolQuery from "@/app/flow-councils/hooks/distributionPoolQuery";
import useStaleVotesQuery from "@/app/flow-councils/hooks/staleVotesQuery";
import useSuperAppFundersQuery, {
  type SuperAppFunderData,
} from "@/app/flow-councils/hooks/superAppFundersQuery";
import { Token } from "@/types/token";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";
import { GOODBUILDERS_COUNCIL_ADDRESSES } from "@/app/flow-councils/lib/constants";
import {
  type FlowCouncilData,
  type CouncilMember,
  type CurrentBallot,
  type NewBallot,
  type Vote,
  type BallotAction,
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
  currentBallot?: CurrentBallot;
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
        status: string;
      }[]
    | null;
  distributionPool?: GDAPool;
  superAppFunderData?: SuperAppFunderData;
  token: Token;
  newBallot?: NewBallot;
  showBallot: boolean;
} | null>(null);

export const BallotDispatchContext =
  createContext<React.Dispatch<BallotAction> | null>(null);

export const ShowBallotDispatchContext =
  createContext<React.Dispatch<ShowBallotAction> | null>(null);

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

function newBallotReducer(newBallot: NewBallot, action: BallotAction) {
  switch (action.type) {
    case "add": {
      if (!action.vote) {
        return action.currentBallot
          ? {
              ...newBallot,
              votes: action.currentBallot.votes,
            }
          : { ...newBallot };
      }

      const base =
        newBallot.votes.length > 0
          ? newBallot.votes
          : (action.currentBallot?.votes ?? []);

      return { ...newBallot, votes: [...base, action.vote] };
    }
    case "update": {
      const updatedVotes = [...newBallot.votes];
      const index = newBallot.votes.findIndex(
        (a) => a.recipient === action.vote.recipient,
      );

      if (index >= 0) {
        updatedVotes[index] = action.vote;
      }

      return { ...newBallot, votes: updatedVotes };
    }
    case "delete": {
      return {
        ...newBallot,
        votes: newBallot.votes.filter(
          (a) => a.recipient !== action.vote.recipient,
        ),
      };
    }
    case "clear": {
      return {
        votes: [],
      };
    }
  }
}

export function FlowCouncilContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const chainId = params.chainId
    ? params.chainId.toString()
    : String(DEFAULT_CHAIN_ID);
  const councilId = params.councilId as string;

  return (
    <FlowCouncilContextProviderInner
      key={`${chainId}-${councilId}`}
      chainId={chainId}
      councilId={councilId}
    >
      {children}
    </FlowCouncilContextProviderInner>
  );
}

function FlowCouncilContextProviderInner({
  children,
  chainId,
  councilId,
}: {
  children: React.ReactNode;
  chainId: string;
  councilId: string;
}) {
  const { address } = useAccount();
  const pathname = usePathname();
  const isVotingPage =
    !!councilId && pathname === `/flow-councils/${chainId}/${councilId}`;
  const network =
    networks.find(
      (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
    ) ?? networks[0];
  const council = useCouncilQuery(network, councilId, isVotingPage);
  const councilMetadata = useFlowCouncilMetadata(Number(chainId), councilId);
  const projects = useRecipientsQuery(network, council?.recipients, councilId);
  const distributionPool = useDistributionPoolQuery(
    network,
    council?.distributionPool,
    isVotingPage,
  );
  const currentBallot = useBallotQuery(
    network,
    councilId,
    address ?? "",
    isVotingPage,
  );
  const councilMemberRaw = useCouncilMemberQuery(
    network,
    councilId,
    address ?? "",
    isVotingPage,
  );
  const isGoodDollarCouncil =
    councilId?.toLowerCase() === GOODBUILDERS_COUNCIL_ADDRESSES[1];
  const { staleVotes, isLoading: isLoadingStaleVotes } = useStaleVotesQuery(
    isGoodDollarCouncil ? councilId : "",
    isGoodDollarCouncil ? address ?? "" : "",
  );
  const staleVotesList = useMemo((): Vote[] => {
    if (!currentBallot?.votes || !council?.recipients) return [];

    const activeRecipients = new Set(
      council.recipients.map((r: { account: string }) =>
        r.account.toLowerCase(),
      ),
    );

    return currentBallot.votes.filter(
      (v: Vote) => !activeRecipients.has(v.recipient.toLowerCase()),
    );
  }, [currentBallot?.votes, council?.recipients]);
  const filteredCurrentBallot = useMemo(() => {
    if (!currentBallot || staleVotesList.length === 0) return currentBallot;

    const staleRecipients = new Set(
      staleVotesList.map((v) => v.recipient.toLowerCase()),
    );

    return {
      ...currentBallot,
      votes: currentBallot.votes.filter(
        (v: Vote) => !staleRecipients.has(v.recipient.toLowerCase()),
      ),
    };
  }, [currentBallot, staleVotesList]);
  const councilMember = useMemo(() => {
    if (!councilMemberRaw || (isGoodDollarCouncil && isLoadingStaleVotes))
      return undefined;

    if (isGoodDollarCouncil && staleVotes > 0) {
      return {
        ...councilMemberRaw,
        votingPower: Math.max(
          0,
          Number(councilMemberRaw.votingPower) - staleVotes,
        ),
      };
    }

    return councilMemberRaw;
  }, [councilMemberRaw, isGoodDollarCouncil, staleVotes, isLoadingStaleVotes]);
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
    isVotingPage,
  );

  const [newBallot, dispatchNewBallot] = useReducer(newBallotReducer, {
    votes: [],
  });
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
        currentBallot: filteredCurrentBallot,
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
