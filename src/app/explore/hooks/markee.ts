import { useMemo } from "react";
import { Address, erc20Abi } from "viem";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { cfaForwarderAbi } from "@sfpro/sdk/abi";
import { hostAbi } from "@sfpro/sdk/abi/core";
import { markeeAbi, markeeLeaderboardAbi } from "@/lib/abi/markee";
import { ZERO_ADDRESS } from "@/lib/constants";
import {
  CFA_AGREEMENT_ID,
  CFA_FORWARDER,
  ETHX,
  FLOW_STATE_MARKEE_ADDRESS,
  GDA_AGREEMENT_ID,
  MARKEE_CHAIN_ID,
  MarkeeEntry,
  SUPERFLUID_HOST,
} from "../lib/markee";

const BOARD_REFRESH_INTERVAL = 60000;
const BACKER_REFRESH_INTERVAL = 10000;
const TOP_MARKEES_LIMIT = 10n;

const boardContract = {
  chainId: MARKEE_CHAIN_ID,
  address: FLOW_STATE_MARKEE_ADDRESS,
  abi: markeeLeaderboardAbi,
} as const;

export function useMarkeeBoard() {
  const {
    data: boardData,
    isLoading: isBoardLoading,
    isError: isBoardError,
    refetch: refetchBoard,
  } = useReadContracts({
    contracts: [
      { ...boardContract, functionName: "minimumMonthlyRate" },
      { ...boardContract, functionName: "maxMessageLength" },
      { ...boardContract, functionName: "maxNameLength" },
      {
        ...boardContract,
        functionName: "getTopMarkees",
        args: [TOP_MARKEES_LIMIT],
      },
      { ...boardContract, functionName: "topMarkee" },
      { ...boardContract, functionName: "topRate" },
    ],
    query: { refetchInterval: BOARD_REFRESH_INTERVAL },
  });

  const topMarkees = useMemo(() => {
    const result = boardData?.[3];

    if (result?.status !== "success") {
      return [];
    }

    const [addresses, rates] = result.result;

    return addresses.map((address, i) => ({ address, rate: rates[i] ?? 0n }));
  }, [boardData]);

  // topMarkee is the spot the board actually pays; getTopMarkees is a live
  // ranking that can run ahead of it until the keeper calls claimTop
  const enforcedTop =
    boardData?.[4]?.status === "success" ? boardData[4].result : ZERO_ADDRESS;
  // effectiveRate is the bar a challenger must clear (it includes any legacy
  // floor); topRate is only the fallback while that read is in flight
  const { data: effectiveTopRate } = useReadContract({
    ...boardContract,
    functionName: "effectiveRate",
    args: [enforcedTop],
    query: {
      enabled: enforcedTop !== ZERO_ADDRESS,
      refetchInterval: BOARD_REFRESH_INTERVAL,
    },
  });

  const {
    data: detailsData,
    isLoading: isDetailsLoading,
    isError: isDetailsError,
    refetch: refetchDetails,
  } = useReadContracts({
    contracts: topMarkees.flatMap((markee) => [
      {
        chainId: MARKEE_CHAIN_ID,
        address: markee.address,
        abi: markeeAbi,
        functionName: "message",
      },
      {
        chainId: MARKEE_CHAIN_ID,
        address: markee.address,
        abi: markeeAbi,
        functionName: "name",
      },
      {
        chainId: MARKEE_CHAIN_ID,
        address: markee.address,
        abi: markeeAbi,
        functionName: "owner",
      },
    ]),
    query: {
      enabled: topMarkees.length > 0,
      refetchInterval: BOARD_REFRESH_INTERVAL,
    },
  });

  const entries = useMemo(
    (): MarkeeEntry[] =>
      topMarkees
        .map((markee, i) => ({
          ...markee,
          message: (detailsData?.[i * 3]?.result as string | undefined) ?? "",
          name: (detailsData?.[i * 3 + 1]?.result as string | undefined) ?? "",
          owner:
            (detailsData?.[i * 3 + 2]?.result as Address | undefined) ??
            ZERO_ADDRESS,
        }))
        .filter((entry) => entry.message !== ""),
    [topMarkees, detailsData],
  );

  const enforcedRate =
    effectiveTopRate ??
    (boardData?.[5]?.status === "success" ? boardData[5].result : 0n);
  const enforcedEntry =
    entries.find(
      (entry) => entry.address.toLowerCase() === enforcedTop.toLowerCase(),
    ) ?? null;
  const topEntry =
    enforcedEntry !== null && enforcedRate > 0n
      ? { ...enforcedEntry, rate: enforcedRate }
      : null;

  return {
    minimumMonthlyRate:
      boardData?.[0]?.status === "success" ? boardData[0].result : null,
    maxMessageLength:
      boardData?.[1]?.status === "success" ? Number(boardData[1].result) : null,
    maxNameLength:
      boardData?.[2]?.status === "success" ? Number(boardData[2].result) : null,
    entries,
    topEntry,
    isLoading:
      isBoardLoading ||
      (topMarkees.length > 0 && isDetailsLoading && !detailsData),
    isError: isBoardError || isDetailsError,
    refetch: () => {
      refetchBoard();
      refetchDetails();
    },
  };
}

export type MarkeeBoard = ReturnType<typeof useMarkeeBoard>;

export function useMarkeeBacker(
  address: Address | undefined,
  enabled: boolean,
) {
  const isEnabled = enabled && !!address;
  const backer = address ?? ZERO_ADDRESS;

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...boardContract, functionName: "backerMarkee", args: [backer] },
      { ...boardContract, functionName: "backerDeposit", args: [backer] },
      {
        chainId: MARKEE_CHAIN_ID,
        address: CFA_FORWARDER,
        abi: cfaForwarderAbi,
        functionName: "getFlowrate",
        args: [ETHX, backer, FLOW_STATE_MARKEE_ADDRESS],
      },
      {
        chainId: MARKEE_CHAIN_ID,
        address: CFA_FORWARDER,
        abi: cfaForwarderAbi,
        functionName: "getAccountFlowrate",
        args: [ETHX, backer],
      },
      {
        chainId: MARKEE_CHAIN_ID,
        address: ETHX,
        abi: erc20Abi,
        functionName: "allowance",
        args: [backer, FLOW_STATE_MARKEE_ADDRESS],
      },
      {
        chainId: MARKEE_CHAIN_ID,
        address: ETHX,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [backer],
      },
    ],
    query: { enabled: isEnabled, refetchInterval: BACKER_REFRESH_INTERVAL },
  });
  const { data: ethBalance } = useBalance({
    address,
    chainId: MARKEE_CHAIN_ID,
    query: { enabled: isEnabled, refetchInterval: BACKER_REFRESH_INTERVAL },
  });

  const read = <T>(index: number, fallback: T) => {
    const result = data?.[index];

    return result?.status === "success" ? (result.result as T) : fallback;
  };

  return {
    backerMarkee: read<Address>(0, ZERO_ADDRESS),
    backerDeposit: read<bigint>(1, 0n),
    flowRateToBoard: read<bigint>(2, 0n),
    accountNetFlowRate: read<bigint>(3, 0n),
    allowance: read<bigint>(4, 0n),
    ethxBalance: read<bigint>(5, 0n),
    ethBalance: ethBalance?.value ?? 0n,
    isLoaded: !!data && !!ethBalance,
    refetch,
  };
}

export function useSuperfluidAgreements(enabled: boolean) {
  const { data } = useReadContracts({
    contracts: [
      {
        chainId: MARKEE_CHAIN_ID,
        address: SUPERFLUID_HOST,
        abi: hostAbi,
        functionName: "getAgreementClass",
        args: [CFA_AGREEMENT_ID],
      },
      {
        chainId: MARKEE_CHAIN_ID,
        address: SUPERFLUID_HOST,
        abi: hostAbi,
        functionName: "getAgreementClass",
        args: [GDA_AGREEMENT_ID],
      },
    ],
    query: { enabled, staleTime: Infinity },
  });

  return {
    cfaAgreement:
      data?.[0]?.status === "success" ? (data[0].result as Address) : null,
    gdaAgreement:
      data?.[1]?.status === "success" ? (data[1].result as Address) : null,
  };
}
