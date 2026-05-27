"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { Address, erc20Abi, formatUnits, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useConfig,
  usePublicClient,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import { hostAddress } from "@sfpro/sdk/abi/core";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { getApolloClient } from "@/lib/apollo";
import { networks, isSplitterFactoryDeployed } from "@/lib/networks";
import { superAppSplitterAbi } from "@/lib/abi/superAppSplitter";
import {
  buildBatchCall,
  buildCreateFlowBatchOp,
  buildSuperTokenTransferBatchOp,
  buildUpdateFlowBatchOp,
  buildWrapCalls,
} from "@/lib/superfluidTransactions";
import { TransactionCall } from "@/types/transactionCall";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { truncateStr, waitForReceipt } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import useSuperTokenType from "@/hooks/superTokenType";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useSplitterReads from "@/app/flow-councils/hooks/useSplitterReads";
import useActiveSplitterSenders from "@/app/flow-councils/hooks/useActiveSplitterSenders";
import { isPositiveDecimal, sanitizeTxError } from "./helpers";
import { DEFAULT_ADMIN_ROLE } from "../lib/constants";

type FundingProps = { chainId?: number; councilId?: string };

const FLOW_COUNCIL_QUERY = gql`
  query FundingCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      flowCouncilManagers {
        account
        role
      }
    }
  }
`;

const SF_SENDER_OUTFLOWS_QUERY = gql`
  query SenderOutflowsQuery($userAddress: ID!, $token: String!) {
    account(id: $userAddress) {
      outflows(where: { token: $token, currentFlowRate_gt: "0" }) {
        receiver {
          id
        }
        streamedUntilUpdatedAt
        updatedAtTimestamp
        currentFlowRate
      }
    }
  }
`;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isInProgressDecimal(s: string) {
  return s === "" || s === "." || isPositiveDecimal(s);
}

function formatMonthlyForInput(monthlyWei: bigint): string {
  const PRECISION_DIVISOR = 10n ** 9n;
  const half = PRECISION_DIVISOR / 2n;
  const rounded = ((monthlyWei + half) / PRECISION_DIVISOR) * PRECISION_DIVISOR;
  return formatUnits(rounded, 18);
}

function formatTokenAmount(wei: bigint, maxDigits = 6): string {
  return Number(formatUnits(wei, 18)).toLocaleString(undefined, {
    maximumFractionDigits: maxDigits,
  });
}

function SuccessCheckmark() {
  return (
    <NextImage
      src="/success.svg"
      alt="Success"
      width={20}
      height={20}
      style={{
        filter:
          "brightness(0) saturate(100%) invert(85%) sepia(8%) saturate(138%) hue-rotate(138deg) brightness(93%) contrast(106%)",
      }}
    />
  );
}

export default function Funding(props: FundingProps) {
  const { chainId, councilId } = props;

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const network = useMemo(
    () => networks.find((n) => n.id === chainId),
    [chainId],
  );
  const factoryDeployed = isSplitterFactoryDeployed(network);

  const councilMetadata = useCouncilMetadata(chainId ?? 0, councilId ?? "");
  const splitterAddress = councilMetadata.superappSplitterAddress;
  const hasSplitter = !!splitterAddress && factoryDeployed;

  const splitterReads = useSplitterReads({
    splitterAddress,
    hostAddress: network?.superfluidHost ?? null,
    chainId: chainId ?? 0,
    connectedAddress: address,
  });
  const {
    acceptedToken,
    feePortion,
    superTokenBalance: splitterTokenBalance,
    liquidationPeriod,
    impliedMaxMonthlyRate,
    hasStreamAdminRole,
    hasDefaultAdminRole,
    roundEndsAt,
    isRoundClosed,
    refetchRoundEnd,
  } = splitterReads;

  const tokenInfo = useMemo(() => {
    if (!network || !acceptedToken) return undefined;
    return network.tokens.find(
      (t) => t.address.toLowerCase() === acceptedToken.toLowerCase(),
    );
  }, [network, acceptedToken]);

  const { data: flowCouncilQueryRes } = useQuery(FLOW_COUNCIL_QUERY, {
    client: chainId ? getApolloClient("flowCouncil", chainId) : undefined,
    variables: { councilId: councilId?.toLowerCase() },
    skip: !councilId || !chainId,
    pollInterval: 10000,
  });

  const isSuperAdmin = useMemo(() => {
    if (!flowCouncilQueryRes?.flowCouncil?.flowCouncilManagers || !address) {
      return false;
    }
    return flowCouncilQueryRes.flowCouncil.flowCouncilManagers.some(
      (m: { account: string; role: string }) =>
        m.account === address.toLowerCase() && m.role === DEFAULT_ADMIN_ROLE,
    );
  }, [flowCouncilQueryRes, address]);

  const { data: senderOutflowsRes } = useQuery(SF_SENDER_OUTFLOWS_QUERY, {
    client: chainId ? getApolloClient("superfluid", chainId) : undefined,
    variables: {
      userAddress: address?.toLowerCase() ?? "",
      token: acceptedToken?.toLowerCase() ?? "",
    },
    skip: !address || !acceptedToken || !chainId,
    pollInterval: 10000,
  });

  const sponsoredOutflow = useMemo<{
    streamedUntilUpdatedAt: string;
    updatedAtTimestamp: number;
    currentFlowRate: string;
  } | null>(() => {
    if (!address || !acceptedToken || !splitterAddress) return null;
    if (!senderOutflowsRes) return null;
    return (
      senderOutflowsRes.account?.outflows?.find(
        (o: { receiver: { id: string } }) =>
          o.receiver.id === splitterAddress.toLowerCase(),
      ) ?? null
    );
  }, [senderOutflowsRes, address, acceptedToken, splitterAddress]);

  const currentFlowRate = useMemo<bigint | null>(() => {
    if (!address || !acceptedToken || !splitterAddress) return null;
    if (!senderOutflowsRes) return null;
    return sponsoredOutflow ? BigInt(sponsoredOutflow.currentFlowRate) : 0n;
  }, [
    senderOutflowsRes,
    sponsoredOutflow,
    address,
    acceptedToken,
    splitterAddress,
  ]);

  const { balanceUntilUpdatedAt: adminBalanceRaw } = useSuperTokenBalanceOfNow({
    token: acceptedToken ?? undefined,
    address,
    chainId: chainId ?? 0,
  });
  const adminBalance = adminBalanceRaw
    ? BigInt(adminBalanceRaw.toString())
    : 0n;

  const {
    isSuperTokenNative,
    isSuperTokenWrapper,
    isSuperTokenPure,
    underlyingAddress,
  } = useSuperTokenType(acceptedToken ?? "", chainId ?? 0);
  const { data: underlyingBalance } = useBalance({
    address,
    chainId: chainId ?? 0,
    token: isSuperTokenNative ? undefined : underlyingAddress,
    query: {
      enabled: !!address && !!chainId && isSuperTokenWrapper === true,
      refetchInterval: 10000,
    },
  });
  const underlyingValue = underlyingBalance?.value ?? 0n;
  const underlyingDecimals = underlyingBalance?.decimals ?? 18;

  const { data: underlyingAllowance } = useReadContract({
    address: underlyingAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && acceptedToken ? [address, acceptedToken] : undefined,
    chainId: chainId ?? 0,
    query: {
      enabled: !!address && !!acceptedToken && isSuperTokenWrapper === true,
      refetchInterval: 10000,
    },
  });

  const [streamMonthlyAmount, setStreamMonthlyAmount] = useState("");
  const [streamWrapAmount, setStreamWrapAmount] = useState("");

  const hasPrefilledStreamRef = useRef(false);
  const prefilledStreamStringRef = useRef("");
  useEffect(() => {
    if (hasPrefilledStreamRef.current) return;
    if (currentFlowRate === null) return;
    hasPrefilledStreamRef.current = true;
    if (currentFlowRate > 0n) {
      const monthlyWei = currentFlowRate * BigInt(SECONDS_IN_MONTH);
      const prefill = formatMonthlyForInput(monthlyWei);
      prefilledStreamStringRef.current = prefill;
      setStreamMonthlyAmount(prefill);
    }
  }, [currentFlowRate]);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositWrapAmount, setDepositWrapAmount] = useState("");

  const [closeAllConfirmText, setCloseAllConfirmText] = useState("");
  const [closeAllError, setCloseAllError] = useState("");
  const [closeAllSuccess, setCloseAllSuccess] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [isRefreshingSenders, setIsRefreshingSenders] = useState(false);

  const [roundEndDateInput, setRoundEndDateInput] = useState("");
  const [roundEndError, setRoundEndError] = useState("");
  const [isSchedulingRoundEnd, setIsSchedulingRoundEnd] = useState(false);
  const [isCancellingRoundEnd, setIsCancellingRoundEnd] = useState(false);

  const [streamFlashSuccess, setStreamFlashSuccess] = useState(false);
  const [depositFlashSuccess, setDepositFlashSuccess] = useState(false);
  const [scheduleFlashSuccess, setScheduleFlashSuccess] = useState(false);
  const [cancelScheduleFlashSuccess, setCancelScheduleFlashSuccess] =
    useState(false);

  const streamFlowRate = useMemo(() => {
    if (!streamMonthlyAmount || !isPositiveDecimal(streamMonthlyAmount))
      return 0n;
    try {
      const wei = parseEther(streamMonthlyAmount);
      return wei / BigInt(SECONDS_IN_MONTH);
    } catch {
      return 0n;
    }
  }, [streamMonthlyAmount]);

  const additionalFlowRate = useMemo(() => {
    const current = currentFlowRate ?? 0n;
    return streamFlowRate > current ? streamFlowRate - current : 0n;
  }, [streamFlowRate, currentFlowRate]);

  const streamRequiredBuffer = useMemo(() => {
    if (additionalFlowRate === 0n || !liquidationPeriod) return 0n;
    return additionalFlowRate * liquidationPeriod;
  }, [additionalFlowRate, liquidationPeriod]);

  // ─── Projected Funding (read-only estimate) ───
  // Total already streamed by this wallet to the splitter, animated.
  const sponsoredStreamedUntilUpdatedAt = BigInt(
    sponsoredOutflow?.streamedUntilUpdatedAt ?? 0,
  );
  const currentSponsored = useFlowingAmount(
    sponsoredStreamedUntilUpdatedAt,
    sponsoredOutflow?.updatedAtTimestamp ?? 0,
    currentFlowRate ?? 0n,
  );

  // Time left until the round closes. `null` when there is no end date set.
  // Anchored on `roundEndsAt` so it does not recompute on animation frames.
  const remainingSeconds = useMemo<bigint | null>(() => {
    if (!roundEndsAt || roundEndsAt === 0n) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const remaining = roundEndsAt - now;
    return remaining > 0n ? remaining : 0n;
  }, [roundEndsAt]);

  // Snapshot of total streamed once at the pending rate over the remaining
  // duration. Memoized (not animated) so this value stays put — the spec
  // requires a static projection, not a dancing balance.
  const projectedSponsored = useMemo<bigint | null>(() => {
    if (remainingSeconds === null) return null;
    const updatedAt = sponsoredOutflow?.updatedAtTimestamp ?? 0;
    const rate = currentFlowRate ?? 0n;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const elapsed = updatedAt ? now - BigInt(updatedAt) : 0n;
    const streamedSoFar =
      elapsed > 0n
        ? sponsoredStreamedUntilUpdatedAt + rate * elapsed
        : sponsoredStreamedUntilUpdatedAt;
    return streamedSoFar + streamFlowRate * remainingSeconds;
  }, [
    remainingSeconds,
    streamFlowRate,
    currentFlowRate,
    sponsoredOutflow,
    sponsoredStreamedUntilUpdatedAt,
  ]);

  const isStreamUpdate = (currentFlowRate ?? 0n) > 0n;
  const streamFlowRateUnchanged =
    currentFlowRate !== null && streamFlowRate === currentFlowRate;

  const streamWrapWei = useMemo(() => {
    if (!streamWrapAmount || !isPositiveDecimal(streamWrapAmount)) return 0n;
    try {
      return parseEther(streamWrapAmount);
    } catch {
      return 0n;
    }
  }, [streamWrapAmount]);

  const streamWrapUnits = useMemo(() => {
    if (!streamWrapAmount || !isPositiveDecimal(streamWrapAmount)) return 0n;
    try {
      return parseUnits(streamWrapAmount, underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [streamWrapAmount, underlyingDecimals]);

  const streamAvailableSuper = adminBalance + streamWrapWei;
  const streamHasSufficientForBuffer =
    streamAvailableSuper >= streamRequiredBuffer;
  const streamWrapExceedsUnderlying =
    isSuperTokenWrapper === true && streamWrapUnits > underlyingValue;

  const depositWei = useMemo(() => {
    if (!depositAmount || !isPositiveDecimal(depositAmount)) return 0n;
    try {
      return parseEther(depositAmount);
    } catch {
      return 0n;
    }
  }, [depositAmount]);

  const depositWrapWei = useMemo(() => {
    if (!depositWrapAmount || !isPositiveDecimal(depositWrapAmount)) return 0n;
    try {
      return parseEther(depositWrapAmount);
    } catch {
      return 0n;
    }
  }, [depositWrapAmount]);

  const depositWrapUnits = useMemo(() => {
    if (!depositWrapAmount || !isPositiveDecimal(depositWrapAmount)) return 0n;
    try {
      return parseUnits(depositWrapAmount, underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [depositWrapAmount, underlyingDecimals]);

  const depositAvailableSuper = adminBalance + depositWrapWei;
  const depositHasSufficient =
    depositWei > 0n && depositAvailableSuper >= depositWei;
  const depositWrapExceedsUnderlying =
    isSuperTokenWrapper === true && depositWrapUnits > underlyingValue;

  const depositNewImpliedMax = useMemo(() => {
    if (!liquidationPeriod || liquidationPeriod === 0n) return null;
    if (splitterTokenBalance === null) return null;
    const newBalance = splitterTokenBalance + depositWei;
    if (newBalance <= 0n) return 0n;
    return (newBalance * BigInt(SECONDS_IN_MONTH)) / liquidationPeriod;
  }, [splitterTokenBalance, depositWei, liquidationPeriod]);

  const canCloseStreams =
    hasDefaultAdminRole === true ||
    hasStreamAdminRole === true ||
    isSuperAdmin === true;

  const roundStatus = useMemo<
    "open" | "scheduled" | "closed" | "loading"
  >(() => {
    if (isRoundClosed === null || roundEndsAt === null) return "loading";
    if (isRoundClosed) return "closed";
    if (roundEndsAt > 0n) return "scheduled";
    return "open";
  }, [isRoundClosed, roundEndsAt]);

  const roundEndsAtDate = useMemo(() => {
    if (!roundEndsAt || roundEndsAt === 0n) return null;
    return new Date(Number(roundEndsAt) * 1000);
  }, [roundEndsAt]);

  const onChainRolesDefinitivelyFalse =
    hasDefaultAdminRole === false && hasStreamAdminRole === false;
  const canSubmitClose = canCloseStreams && !onChainRolesDefinitivelyFalse;

  const senderSnapshot = useActiveSplitterSenders({
    splitterAddress,
    tokenAddress: acceptedToken,
    chainId: chainId ?? 0,
    enabled: !!splitterAddress && !!acceptedToken && canCloseStreams,
  });

  const validSenders = useMemo(
    () =>
      senderSnapshot.senders.filter((s): s is Address => ADDRESS_RE.test(s)),
    [senderSnapshot.senders],
  );

  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();

  const {
    areTransactionsLoading: depositLoading,
    completedTransactions: depositCompleted,
    transactionError: depositError,
    executeTransactions: depositExecute,
  } = useTransactionsQueue();

  const handleOpenStream = async () => {
    if (
      !address ||
      !acceptedToken ||
      !splitterAddress ||
      !chainId ||
      !(chainId in hostAddress) ||
      streamFlowRate === 0n ||
      streamFlowRateUnchanged ||
      !streamHasSufficientForBuffer
    ) {
      return;
    }

    const chainKey = chainId as keyof typeof hostAddress;
    const calls: TransactionCall[] = [];
    const batchOps = [];

    const needsApproval =
      isSuperTokenWrapper === true &&
      streamWrapUnits > BigInt(underlyingAllowance ?? 0);

    if (streamWrapWei > 0n) {
      const wrap = buildWrapCalls({
        tokenAddress: acceptedToken,
        wrapAmountWei: streamWrapWei,
        wrapAmountUnits: streamWrapUnits,
        isSuperTokenWrapper: isSuperTokenWrapper === true,
        isSuperTokenNative: isSuperTokenNative === true,
        tokenUnderlyingAddress: underlyingAddress,
        needsApproval,
      });
      calls.push(...wrap.calls);
      batchOps.push(...wrap.batchOps);
    }

    if (streamRequiredBuffer > 0n) {
      batchOps.push(
        buildSuperTokenTransferBatchOp({
          tokenAddress: acceptedToken,
          from: address,
          to: splitterAddress,
          amount: streamRequiredBuffer,
        }),
      );
    }

    const flowOp = isStreamUpdate
      ? buildUpdateFlowBatchOp({
          tokenAddress: acceptedToken,
          receiverAddress: splitterAddress,
          flowRate: streamFlowRate,
          chainId: chainKey,
        })
      : buildCreateFlowBatchOp({
          tokenAddress: acceptedToken,
          receiverAddress: splitterAddress,
          flowRate: streamFlowRate,
          chainId: chainKey,
        });
    batchOps.push(flowOp);

    const batchCall = buildBatchCall(batchOps, chainKey);
    if (batchCall) calls.push(batchCall);

    try {
      await executeTransactions(calls);
      setStreamWrapAmount("");
      setStreamFlashSuccess(true);
      setTimeout(() => setStreamFlashSuccess(false), 3000);
    } catch {
      /* empty */
    }
  };

  const handleDeposit = async () => {
    if (
      !address ||
      !acceptedToken ||
      !splitterAddress ||
      !chainId ||
      !(chainId in hostAddress) ||
      depositWei === 0n ||
      !depositHasSufficient
    ) {
      return;
    }

    const chainKey = chainId as keyof typeof hostAddress;
    const calls: TransactionCall[] = [];
    const batchOps = [];

    const needsApproval =
      isSuperTokenWrapper === true &&
      depositWrapUnits > BigInt(underlyingAllowance ?? 0);

    if (depositWrapWei > 0n) {
      const wrap = buildWrapCalls({
        tokenAddress: acceptedToken,
        wrapAmountWei: depositWrapWei,
        wrapAmountUnits: depositWrapUnits,
        isSuperTokenWrapper: isSuperTokenWrapper === true,
        isSuperTokenNative: isSuperTokenNative === true,
        tokenUnderlyingAddress: underlyingAddress,
        needsApproval,
      });
      calls.push(...wrap.calls);
      batchOps.push(...wrap.batchOps);
    }

    batchOps.push(
      buildSuperTokenTransferBatchOp({
        tokenAddress: acceptedToken,
        from: address,
        to: splitterAddress,
        amount: depositWei,
      }),
    );

    const batchCall = buildBatchCall(batchOps, chainKey);
    if (batchCall) calls.push(batchCall);

    try {
      await depositExecute(calls);
      setDepositAmount("");
      setDepositWrapAmount("");
      setDepositFlashSuccess(true);
      setTimeout(() => setDepositFlashSuccess(false), 3000);
    } catch {
      /* empty */
    }
  };

  const handleScheduleRoundEnd = async () => {
    if (
      !address ||
      !splitterAddress ||
      !chainId ||
      !publicClient ||
      !canSubmitClose
    ) {
      return;
    }

    const parsed = roundEndDateInput ? new Date(roundEndDateInput) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      setRoundEndError("Pick a valid date and time");
      return;
    }

    const endsAt = BigInt(Math.floor(parsed.getTime() / 1000));
    if (endsAt <= BigInt(Math.floor(Date.now() / 1000))) {
      setRoundEndError("End time must be in the future");
      return;
    }

    setIsSchedulingRoundEnd(true);
    setRoundEndError("");

    try {
      const hash = await writeContract(wagmiConfig, {
        address: splitterAddress,
        abi: superAppSplitterAbi,
        functionName: "setRoundEnd",
        args: [endsAt],
        chainId,
      });
      await waitForReceipt(publicClient, hash);
      setRoundEndDateInput("");
      refetchRoundEnd();
      setScheduleFlashSuccess(true);
      setTimeout(() => setScheduleFlashSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setRoundEndError(sanitizeTxError(err));
    } finally {
      setIsSchedulingRoundEnd(false);
    }
  };

  const handleCancelRoundEnd = async () => {
    if (
      !address ||
      !splitterAddress ||
      !chainId ||
      !publicClient ||
      !canSubmitClose
    ) {
      return;
    }

    setIsCancellingRoundEnd(true);
    setRoundEndError("");

    try {
      const hash = await writeContract(wagmiConfig, {
        address: splitterAddress,
        abi: superAppSplitterAbi,
        functionName: "setRoundEnd",
        args: [0n],
        chainId,
      });
      await waitForReceipt(publicClient, hash);
      refetchRoundEnd();
      setCancelScheduleFlashSuccess(true);
      setTimeout(() => setCancelScheduleFlashSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setRoundEndError(sanitizeTxError(err));
    } finally {
      setIsCancellingRoundEnd(false);
    }
  };

  const handleRefreshSenders = async () => {
    setIsRefreshingSenders(true);
    try {
      await senderSnapshot.refetch();
    } finally {
      setIsRefreshingSenders(false);
    }
  };

  const handleCloseAll = async () => {
    if (
      !address ||
      !splitterAddress ||
      !chainId ||
      !publicClient ||
      closeAllConfirmText !== "Close All" ||
      validSenders.length === 0
    ) {
      return;
    }

    setIsClosingAll(true);
    setCloseAllError("");

    try {
      const hash = await writeContract(wagmiConfig, {
        address: splitterAddress,
        abi: superAppSplitterAbi,
        functionName: "closeIncomingStreams",
        args: [validSenders],
        chainId,
      });
      await waitForReceipt(publicClient, hash);
      setCloseAllSuccess(true);
      setTimeout(() => setCloseAllSuccess(false), 3000);
      setCloseAllConfirmText("");
      await senderSnapshot.refetch();
    } catch (err) {
      console.error(err);
      setCloseAllError(sanitizeTxError(err));
    } finally {
      setIsClosingAll(false);
    }
  };

  const explorerHref =
    network?.blockExplorer && splitterAddress
      ? `${network.blockExplorer.replace(/\/$/, "")}/address/${splitterAddress}`
      : null;

  const superfluidStreamsHref =
    network?.superfluidExplorer && splitterAddress
      ? `${network.superfluidExplorer.replace(/\/$/, "")}/accounts/${splitterAddress}?tab=streams`
      : null;

  const tokenSymbol = tokenInfo?.symbol ?? "";

  const renderStreamButton = () => {
    if (!address) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => openConnectModal?.()}
        >
          Connect Wallet
        </Button>
      );
    }
    if (connectedChain?.id !== chainId) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => chainId && switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }
    return (
      <Button
        variant={streamFlashSuccess ? "success" : "primary"}
        disabled={
          !streamFlashSuccess &&
          (areTransactionsLoading ||
            streamFlowRate === 0n ||
            streamFlowRateUnchanged ||
            !streamHasSufficientForBuffer ||
            streamWrapExceedsUnderlying)
        }
        style={{ pointerEvents: streamFlashSuccess ? "none" : "auto" }}
        className="fs-lg fw-semi-bold py-4 rounded-4"
        onClick={handleOpenStream}
      >
        {streamFlashSuccess ? (
          <SuccessCheckmark />
        ) : areTransactionsLoading ? (
          <>
            <Spinner size="sm" className="me-2" />
            {completedTransactions > 0 ? `${completedTransactions}` : null}
          </>
        ) : isStreamUpdate ? (
          "Update Stream"
        ) : (
          "Open Stream"
        )}
      </Button>
    );
  };

  const renderDepositButton = () => {
    if (!address) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => openConnectModal?.()}
        >
          Connect Wallet
        </Button>
      );
    }
    if (connectedChain?.id !== chainId) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => chainId && switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }
    return (
      <Button
        variant={depositFlashSuccess ? "success" : "primary"}
        disabled={
          !depositFlashSuccess &&
          (depositLoading ||
            depositWei === 0n ||
            !depositHasSufficient ||
            depositWrapExceedsUnderlying)
        }
        style={{ pointerEvents: depositFlashSuccess ? "none" : "auto" }}
        className="fs-lg fw-semi-bold py-4 rounded-4"
        onClick={handleDeposit}
      >
        {depositFlashSuccess ? (
          <SuccessCheckmark />
        ) : depositLoading ? (
          <>
            <Spinner size="sm" className="me-2" />
            {depositCompleted > 0 ? `${depositCompleted}` : null}
          </>
        ) : (
          "Deposit"
        )}
      </Button>
    );
  };

  if (!chainId || !councilId) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  if (!hasSplitter) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
        >
          <Card className="bg-lace-100 rounded-4 border-0 p-4">
            <Card.Title className="fs-5 fw-semi-bold">Funding</Card.Title>
            <Card.Text className="text-info">
              No Super App splitter is configured for this council on this
              network. Funding actions are unavailable.
            </Card.Text>
          </Card>
        </Stack>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
        gap={4}
      >
        {/* Information panel */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Super App Splitter
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Flow Councils use a stream split forwarding contract to give round
              admins the ability to close the round and all incoming streams on
              behalf of all donors. The splitter also collects a platform
              sustainability fee which accrues in the contract until round
              close. This contract must always hold at least 4 hours of the
              token at the current funding rate.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 2 : 4}
              className="align-items-start"
            >
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Splitter
                </Card.Text>
                {explorerHref ? (
                  <a
                    href={explorerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-decoration-none fw-semi-bold"
                  >
                    {truncateStr(splitterAddress!, 16)}
                  </a>
                ) : (
                  <span className="fw-semi-bold">
                    {truncateStr(splitterAddress!, 16)}
                  </span>
                )}
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Sustainability fee
                </Card.Text>
                <span className="fw-semi-bold">
                  {feePortion !== null ? (
                    `${feePortion}%`
                  ) : (
                    <Spinner size="sm" />
                  )}
                </span>
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Splitter balance
                </Card.Text>
                <span className="fw-semi-bold">
                  {splitterTokenBalance !== null ? (
                    `${Number(
                      formatUnits(splitterTokenBalance, 18),
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })} ${tokenSymbol}`
                  ) : (
                    <Spinner size="sm" />
                  )}
                </span>
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Implied max funding rate
                </Card.Text>
                <span className="fw-semi-bold">
                  {impliedMaxMonthlyRate !== null ? (
                    impliedMaxMonthlyRate === 0n ? (
                      "—"
                    ) : (
                      `${Number(
                        formatUnits(impliedMaxMonthlyRate, 18),
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })} ${tokenSymbol}/mo`
                    )
                  ) : (
                    <Spinner size="sm" />
                  )}
                </span>
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Round status
                </Card.Text>
                <span className="fw-semi-bold">
                  {roundStatus === "loading" ? (
                    <Spinner size="sm" />
                  ) : roundStatus === "open" ? (
                    <span className="text-success">Open</span>
                  ) : roundStatus === "scheduled" ? (
                    <span className="text-success">
                      Open - Ends{" "}
                      {roundEndsAtDate?.toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  ) : (
                    <span className="text-danger">Closed</span>
                  )}
                </span>
              </Stack>
            </Stack>
          </Card.Body>
        </Card>

        {/* Round End Date */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Round End Date
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Set an end to your round (in your local time zone). After this
              passes, streams into the round can only be closed. You can do this
              for all active streams at the bottom of this page.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              {!canCloseStreams ? (
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  (Round Super Admins Only)
                </Card.Text>
              ) : null}
              {roundStatus === "scheduled" ? (
                <Alert variant="warning" className="mb-0 fw-semi-bold">
                  Round end currently scheduled for{" "}
                  {roundEndsAtDate?.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </Alert>
              ) : null}
              {roundStatus === "closed" ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Round is already closed. New incoming streams will revert.
                </Alert>
              ) : null}
              {roundStatus !== "closed" ? (
                <Form.Group>
                  <Form.Label className="fw-semi-bold">
                    Round end date and time
                  </Form.Label>
                  <Form.Control
                    type="datetime-local"
                    disabled={!canSubmitClose}
                    value={roundEndDateInput}
                    onChange={(e) => setRoundEndDateInput(e.target.value)}
                    className={`border-0 rounded-4 bg-white py-4 fw-semi-bold w-auto ${!canSubmitClose ? "text-info" : ""}`}
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              ) : null}
              {roundEndError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {roundEndError}
                </Alert>
              ) : null}
              {roundStatus !== "closed" ? (
                <Stack direction={isMobile ? "vertical" : "horizontal"} gap={3}>
                  <Button
                    variant={scheduleFlashSuccess ? "success" : "primary"}
                    disabled={
                      !scheduleFlashSuccess &&
                      (!canSubmitClose ||
                        isSchedulingRoundEnd ||
                        isCancellingRoundEnd ||
                        !roundEndDateInput)
                    }
                    style={{
                      pointerEvents: scheduleFlashSuccess ? "none" : "auto",
                    }}
                    className="fs-lg fw-semi-bold py-4 rounded-4 flex-grow-1"
                    onClick={handleScheduleRoundEnd}
                  >
                    {scheduleFlashSuccess ? (
                      <SuccessCheckmark />
                    ) : isSchedulingRoundEnd ? (
                      <Spinner size="sm" />
                    ) : roundStatus === "scheduled" ? (
                      "Reschedule"
                    ) : (
                      "Schedule"
                    )}
                  </Button>
                  {roundStatus === "scheduled" ? (
                    <Button
                      variant={
                        cancelScheduleFlashSuccess
                          ? "success"
                          : "outline-secondary"
                      }
                      disabled={
                        !cancelScheduleFlashSuccess &&
                        (!canSubmitClose ||
                          isSchedulingRoundEnd ||
                          isCancellingRoundEnd)
                      }
                      style={{
                        pointerEvents: cancelScheduleFlashSuccess
                          ? "none"
                          : "auto",
                      }}
                      className="fs-lg fw-semi-bold py-4 rounded-4 flex-grow-1"
                      onClick={handleCancelRoundEnd}
                    >
                      {cancelScheduleFlashSuccess ? (
                        <SuccessCheckmark />
                      ) : isCancellingRoundEnd ? (
                        <Spinner size="sm" />
                      ) : (
                        "Remove End Date"
                      )}
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          </Card.Body>
        </Card>

        {/* Action 1 — Open primary stream */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Sponsor Stream
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Admins must open the round&apos;s first funding stream here after
              grantees have been added. In this checkout flow, you&apos;ll fund
              your own 4-hour buffer deposit. We avoid that complexity for
              funders on the public UI.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Monthly flow rate ({tokenSymbol})
                  {isStreamUpdate &&
                  currentFlowRate &&
                  streamMonthlyAmount !== prefilledStreamStringRef.current ? (
                    <span className="text-info ms-2 fw-normal">
                      Current:{" "}
                      {formatMonthlyForInput(
                        currentFlowRate * BigInt(SECONDS_IN_MONTH),
                      )}{" "}
                      {tokenSymbol}/mo
                    </span>
                  ) : null}
                </Form.Label>
                <Form.Control
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={streamMonthlyAmount}
                  onChange={(e) => {
                    if (isInProgressDecimal(e.target.value)) {
                      setStreamMonthlyAmount(e.target.value);
                    }
                  }}
                  className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                />
              </Form.Group>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                gap={isMobile ? 1 : 4}
              >
                <Stack direction="vertical" className="flex-grow-1">
                  <Card.Text className="text-info mb-0 fw-semi-bold">
                    {isStreamUpdate
                      ? "Additional buffer required"
                      : "Required buffer deposit"}
                  </Card.Text>
                  <span className="fw-semi-bold">
                    {liquidationPeriod
                      ? `${Number(
                          formatUnits(streamRequiredBuffer, 18),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })} ${tokenSymbol}`
                      : "—"}
                  </span>
                </Stack>
                <Stack direction="vertical" className="flex-grow-1">
                  <Card.Text className="text-info mb-0 fw-semi-bold">
                    Your {tokenSymbol} balance
                  </Card.Text>
                  <span className="fw-semi-bold">
                    {`${Number(formatUnits(adminBalance, 18)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 6 },
                    )} ${tokenSymbol}`}
                  </span>
                </Stack>
              </Stack>
              {isSuperTokenPure === false && (
                <Form.Group>
                  <Form.Label className="fw-semi-bold">
                    Wrap underlying (optional)
                    {underlyingBalance ? (
                      <span className="text-info ms-2 fw-normal">
                        Available:{" "}
                        {Number(
                          formatUnits(underlyingValue, underlyingDecimals),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        {underlyingBalance.symbol}
                      </span>
                    ) : null}
                  </Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={streamWrapAmount}
                    onChange={(e) => {
                      if (isInProgressDecimal(e.target.value)) {
                        setStreamWrapAmount(e.target.value);
                      }
                    }}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              )}
              <Stack
                direction="vertical"
                gap={2}
                className="bg-white rounded-4 p-3"
              >
                <Card.Text className="mb-0 fw-semi-bold">
                  Projected Funding
                </Card.Text>
                <Stack
                  direction="horizontal"
                  className="justify-content-between"
                >
                  <span className="text-info fw-semi-bold">
                    Remaining duration
                  </span>
                  <span className="fw-semi-bold">
                    {remainingSeconds === null
                      ? "No end date"
                      : remainingSeconds === 0n
                        ? "Round ended"
                        : `${(Number(remainingSeconds) / 86400).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 1 },
                          )} days`}
                  </span>
                </Stack>
                <Stack
                  direction="horizontal"
                  className="justify-content-between"
                >
                  <span className="text-info fw-semi-bold">Sponsored rate</span>
                  <span className="fw-semi-bold">
                    {`${formatTokenAmount(
                      streamFlowRate * BigInt(SECONDS_IN_MONTH),
                      4,
                    )} ${tokenSymbol}/mo`}
                  </span>
                </Stack>
                <Stack
                  direction="horizontal"
                  className="justify-content-between"
                >
                  <span className="text-info fw-semi-bold">
                    Current sponsored
                  </span>
                  <span className="fw-semi-bold">
                    {`${formatTokenAmount(currentSponsored)} ${tokenSymbol}`}
                  </span>
                </Stack>
                <Stack
                  direction="horizontal"
                  className="justify-content-between"
                >
                  <span className="text-info fw-semi-bold">
                    Projected sponsored
                  </span>
                  <span className="fw-semi-bold">
                    {projectedSponsored === null
                      ? "—"
                      : `${formatTokenAmount(projectedSponsored, 4)} ${tokenSymbol}`}
                  </span>
                </Stack>
              </Stack>
              {streamWrapExceedsUnderlying ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Wrap amount exceeds your underlying balance.
                </Alert>
              ) : null}
              {!streamHasSufficientForBuffer && streamFlowRate > 0n ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {isStreamUpdate ? "Additional buffer" : "Required buffer"}{" "}
                  exceeds your {tokenSymbol} balance plus the amount you intend
                  to wrap.
                </Alert>
              ) : null}
              {transactionError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {transactionError}
                </Alert>
              ) : null}
              {renderStreamButton()}
            </Stack>
          </Card.Body>
        </Card>

        {/* Action 2 — Direct deposit */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Splitter Transfer
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Add Super Tokens to the splitter without opening a stream. This
              raises the max funding rate your round can support without waiting
              for fees to accrue in the contract. We recommend this option if
              you expect early, significant funding support from your community.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Deposit amount ({tokenSymbol})
                </Form.Label>
                <Form.Control
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={depositAmount}
                  onChange={(e) => {
                    if (isInProgressDecimal(e.target.value)) {
                      setDepositAmount(e.target.value);
                    }
                  }}
                  className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                />
              </Form.Group>
              <Stack direction="vertical" className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Your {tokenSymbol} balance
                </Card.Text>
                <span className="fw-semi-bold">
                  {`${Number(formatUnits(adminBalance, 18)).toLocaleString(
                    undefined,
                    { maximumFractionDigits: 6 },
                  )} ${tokenSymbol}`}
                </span>
              </Stack>
              {isSuperTokenPure === false && (
                <Form.Group>
                  <Form.Label className="fw-semi-bold">
                    Wrap underlying (optional)
                    {underlyingBalance ? (
                      <span className="text-info ms-2 fw-normal">
                        Available:{" "}
                        {Number(
                          formatUnits(underlyingValue, underlyingDecimals),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        {underlyingBalance.symbol}
                      </span>
                    ) : null}
                  </Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={depositWrapAmount}
                    onChange={(e) => {
                      if (isInProgressDecimal(e.target.value)) {
                        setDepositWrapAmount(e.target.value);
                      }
                    }}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              )}
              {depositWei > 0n && depositNewImpliedMax !== null ? (
                <Stack direction="vertical" gap={1}>
                  {impliedMaxMonthlyRate !== null &&
                  impliedMaxMonthlyRate > 0n ? (
                    <Card.Text className="mb-0 fw-semi-bold">
                      Δ implied max:{" "}
                      <span className="text-success">
                        +
                        {Number(
                          formatUnits(
                            depositNewImpliedMax - impliedMaxMonthlyRate,
                            18,
                          ),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {tokenSymbol}/mo
                      </span>
                    </Card.Text>
                  ) : null}
                  <Card.Text className="mb-0 fw-semi-bold">
                    New implied max:{" "}
                    {Number(
                      formatUnits(depositNewImpliedMax, 18),
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    {tokenSymbol}/mo
                  </Card.Text>
                </Stack>
              ) : null}
              {depositWrapExceedsUnderlying ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Wrap amount exceeds your underlying balance.
                </Alert>
              ) : null}
              {depositWei > 0n && !depositHasSufficient ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Deposit exceeds your {tokenSymbol} balance plus the amount you
                  intend to wrap.
                </Alert>
              ) : null}
              {depositError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {depositError}
                </Alert>
              ) : null}
              {renderDepositButton()}
            </Stack>
          </Card.Body>
        </Card>

        {/* Danger Zone — Close All */}
        <Card className="rounded-4 border border-danger p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold text-danger">
              Danger Zone — Close All
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Flow Council funding streams are open-ended by default. You can
              close all incoming streams to your round here. We only recommend
              doing this in emergencies or after your round&apos;s scheduled end
              date.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              {!canCloseStreams ? (
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  (Round Super Admins Only)
                </Card.Text>
              ) : null}
              {isSuperAdmin &&
              hasStreamAdminRole === false &&
              hasDefaultAdminRole === false ? (
                <Alert variant="warning" className="mb-0 fw-semi-bold">
                  Your wallet is a Super Admin in the council registry but does
                  not hold STREAM_ADMIN_ROLE on the splitter contract. The
                  transaction will revert.
                </Alert>
              ) : null}
              {canCloseStreams ? (
                <Stack
                  direction="horizontal"
                  gap={2}
                  className="align-items-center"
                >
                  <Card.Text className="mb-0 fw-semi-bold">
                    {senderSnapshot.loading ? (
                      <Spinner size="sm" />
                    ) : superfluidStreamsHref ? (
                      <a
                        href={superfluidStreamsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-decoration-none"
                      >
                        {validSenders.length} stream
                        {validSenders.length === 1 ? "" : "s"} to close
                      </a>
                    ) : (
                      `${validSenders.length} stream${validSenders.length === 1 ? "" : "s"} to close`
                    )}
                  </Card.Text>
                  {!senderSnapshot.loading ? (
                    <Button
                      variant="link"
                      className="p-0 border-0 lh-1"
                      onClick={handleRefreshSenders}
                      disabled={isRefreshingSenders}
                      aria-label="Refresh stream count"
                    >
                      {isRefreshingSenders ? (
                        <Spinner size="sm" />
                      ) : (
                        <NextImage
                          src="/reload.svg"
                          alt="Refresh"
                          width={20}
                          height={20}
                        />
                      )}
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
              {canCloseStreams && senderSnapshot.truncated ? (
                <Alert variant="warning" className="mb-0 fw-semi-bold">
                  Showing the first {validSenders.length} active senders. There
                  are likely more — run Close All again after this transaction
                  to close the remaining streams.
                </Alert>
              ) : null}
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Type <span className="text-danger">Close All</span> to confirm
                </Form.Label>
                <Form.Control
                  type="text"
                  disabled={!canSubmitClose}
                  value={closeAllConfirmText}
                  onChange={(e) => setCloseAllConfirmText(e.target.value)}
                  className="border border-danger rounded-4 bg-white py-4 fw-semi-bold"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                />
              </Form.Group>
              {closeAllError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {closeAllError}
                </Alert>
              ) : null}
              <Button
                variant={closeAllSuccess ? "success" : "danger"}
                disabled={
                  !closeAllSuccess &&
                  (!canSubmitClose ||
                    isClosingAll ||
                    closeAllConfirmText !== "Close All" ||
                    validSenders.length === 0)
                }
                style={{ pointerEvents: closeAllSuccess ? "none" : "auto" }}
                className="fs-lg fw-semi-bold py-4 rounded-4 text-light shadow"
                onClick={handleCloseAll}
              >
                {closeAllSuccess ? (
                  <SuccessCheckmark />
                ) : isClosingAll ? (
                  <Spinner size="sm" />
                ) : (
                  "Close All"
                )}
              </Button>
            </Stack>
          </Card.Body>
        </Card>

        {/* Wizard nav */}
        <Stack direction="vertical" gap={3} className="mb-30">
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold py-4 rounded-4"
            onClick={() =>
              router.push(
                `/flow-councils/communications/${chainId}/${councilId}`,
              )
            }
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </>
  );
}
