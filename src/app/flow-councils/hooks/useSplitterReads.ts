import { useMemo } from "react";
import { Address, keccak256, parseAbi, toBytes } from "viem";
import { useReadContract } from "wagmi";
import { hostAbi, governanceAbi } from "@sfpro/sdk/abi/core";
import { superAppSplitterAbi } from "@/lib/abi/superAppSplitter";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { DEFAULT_ADMIN_ROLE } from "../lib/constants";

const STREAM_ADMIN_ROLE = keccak256(toBytes("STREAM_ADMIN_ROLE"));

const realtimeBalanceOfNowAbi = parseAbi([
  "function realtimeBalanceOfNow(address) view returns (int256,uint256,uint256,uint256)",
]);

export type SplitterReads = {
  acceptedToken: Address | null;
  feePortion: number | null;
  superTokenBalance: bigint | null;
  liquidationPeriod: bigint | null;
  impliedMaxMonthlyRate: bigint | null;
  hasStreamAdminRole: boolean | null;
  hasDefaultAdminRole: boolean | null;
  roundEndsAt: bigint | null;
  isRoundClosed: boolean | null;
  refetchRoundEnd: () => void;
};

export default function useSplitterReads({
  splitterAddress,
  hostAddress: hostAddr,
  chainId,
  connectedAddress,
}: {
  splitterAddress: Address | null;
  hostAddress: Address | null;
  chainId: number;
  connectedAddress: Address | undefined;
}): SplitterReads {
  const { data: feePortionRaw } = useReadContract({
    address: splitterAddress ?? undefined,
    abi: superAppSplitterAbi,
    functionName: "FEE_PORTION",
    chainId,
    query: { enabled: !!splitterAddress },
  });

  const { data: acceptedToken } = useReadContract({
    address: splitterAddress ?? undefined,
    abi: superAppSplitterAbi,
    functionName: "ACCEPTED_TOKEN",
    chainId,
    query: { enabled: !!splitterAddress },
  });

  const { data: balanceData } = useReadContract({
    address: acceptedToken,
    abi: realtimeBalanceOfNowAbi,
    functionName: "realtimeBalanceOfNow",
    args: splitterAddress ? [splitterAddress] : undefined,
    chainId,
    query: {
      enabled: !!acceptedToken && !!splitterAddress,
      refetchInterval: 10000,
    },
  });

  const { data: governanceAddr } = useReadContract({
    address: hostAddr ?? undefined,
    abi: hostAbi,
    functionName: "getGovernance",
    chainId,
    query: { enabled: !!hostAddr },
  });

  const { data: pppConfig } = useReadContract({
    address: governanceAddr,
    abi: governanceAbi,
    functionName: "getPPPConfig",
    args: hostAddr && acceptedToken ? [hostAddr, acceptedToken] : undefined,
    chainId,
    query: { enabled: !!governanceAddr && !!hostAddr && !!acceptedToken },
  });

  const { data: hasStreamAdminRole } = useReadContract({
    address: splitterAddress ?? undefined,
    abi: superAppSplitterAbi,
    functionName: "hasRole",
    args: connectedAddress
      ? [STREAM_ADMIN_ROLE, connectedAddress]
      : undefined,
    chainId,
    query: { enabled: !!splitterAddress && !!connectedAddress },
  });

  const { data: hasDefaultAdminRole } = useReadContract({
    address: splitterAddress ?? undefined,
    abi: superAppSplitterAbi,
    functionName: "hasRole",
    args: connectedAddress
      ? [DEFAULT_ADMIN_ROLE, connectedAddress]
      : undefined,
    chainId,
    query: { enabled: !!splitterAddress && !!connectedAddress },
  });

  const { data: roundEndsAtRaw, refetch: refetchRoundEndsAt } = useReadContract(
    {
      address: splitterAddress ?? undefined,
      abi: superAppSplitterAbi,
      functionName: "roundEndsAt",
      chainId,
      query: { enabled: !!splitterAddress, refetchInterval: 10000 },
    },
  );

  const { data: isRoundClosedRaw, refetch: refetchIsRoundClosed } =
    useReadContract({
      address: splitterAddress ?? undefined,
      abi: superAppSplitterAbi,
      functionName: "isRoundClosed",
      chainId,
      query: { enabled: !!splitterAddress, refetchInterval: 10000 },
    });

  // FEE_PORTION is encoded as permille on the splitter contract (e.g. 50 -> 5%).
  const feePortion =
    feePortionRaw !== undefined && feePortionRaw !== null
      ? Number(feePortionRaw) / 10
      : null;
  const superTokenBalance = balanceData ? BigInt(balanceData[0]) : null;
  const liquidationPeriod = pppConfig ? BigInt(pppConfig[0]) : null;

  const impliedMaxMonthlyRate = useMemo(() => {
    if (
      superTokenBalance === null ||
      liquidationPeriod === null ||
      liquidationPeriod === 0n
    ) {
      return null;
    }
    if (superTokenBalance <= 0n) return 0n;
    return (superTokenBalance * BigInt(SECONDS_IN_MONTH)) / liquidationPeriod;
  }, [superTokenBalance, liquidationPeriod]);

  const refetchRoundEnd = () => {
    refetchRoundEndsAt();
    refetchIsRoundClosed();
  };

  return {
    acceptedToken: (acceptedToken as Address | undefined) ?? null,
    feePortion,
    superTokenBalance,
    liquidationPeriod,
    impliedMaxMonthlyRate,
    hasStreamAdminRole:
      hasStreamAdminRole === undefined ? null : Boolean(hasStreamAdminRole),
    hasDefaultAdminRole:
      hasDefaultAdminRole === undefined ? null : Boolean(hasDefaultAdminRole),
    roundEndsAt:
      roundEndsAtRaw !== undefined && roundEndsAtRaw !== null
        ? BigInt(roundEndsAtRaw)
        : null,
    isRoundClosed:
      isRoundClosedRaw === undefined ? null : Boolean(isRoundClosedRaw),
    refetchRoundEnd,
  };
}
