import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Address, parseEther, parseUnits, formatUnits, erc20Abi } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, gql } from "@apollo/client";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { hostAddress, cfaAddress } from "@sfpro/sdk/abi/core";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { TransactionCall } from "@/types/transactionCall";
import {
  buildWrapCalls,
  buildFlowBatchOps,
  buildDeleteFlowBatchOps,
  buildBatchCall,
} from "@/lib/superfluidTransactions";
import { getApolloClient } from "@/lib/apollo";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useFlowingAmount from "@/hooks/flowingAmount";
import useSuperTokenType from "@/hooks/superTokenType";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  roundWeiAmount,
  formatNumber,
} from "@/lib/utils";
import { SECONDS_IN_MONTH, MAX_FLOW_RATE } from "@/lib/constants";

dayjs.extend(duration);

const USER_ACCOUNT_QUERY = gql`
  query UserAccountQuery($userAddress: String!, $token: String!) {
    account(id: $userAddress) {
      accountTokenSnapshots(where: { token: $token }) {
        totalNetFlowRate
        totalOutflowRate
        balanceUntilUpdatedAt
        updatedAtTimestamp
        token {
          id
        }
      }
      outflows(
        where: { token: $token }
        orderBy: updatedAtTimestamp
        orderDirection: desc
      ) {
        receiver {
          id
        }
        currentFlowRate
      }
    }
  }
`;

const RECEIVER_INFLOW_QUERY = gql`
  query ReceiverInflowQuery($receiverAddress: ID!, $token: String!) {
    account(id: $receiverAddress) {
      accountTokenSnapshots(where: { token: $token }) {
        totalInflowRate
      }
    }
  }
`;

export default function useStreamFunding(
  network: Network,
  receiverAddress: string,
) {
  const [selectedToken, setSelectedToken] = useState<Token>(network.tokens[0]);
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [newFlowRate, setNewFlowRate] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const userEditedMonthlyAmount = useRef(false);

  const { address, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();

  const isCorrectChain = walletChainId === network.id;

  const {
    isSuperTokenNative,
    isSuperTokenWrapper,
    isSuperTokenPure,
    underlyingAddress: tokenUnderlyingAddress,
  } = useSuperTokenType(selectedToken.address, network.id);

  const nativeTokenSymbol = selectedToken.symbol === "CELOx" ? "CELO" : "ETH";

  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network.id,
    token:
      isSuperTokenNative || !tokenUnderlyingAddress
        ? void 0
        : (tokenUnderlyingAddress as Address),
    query: {
      refetchInterval: 10000,
      enabled:
        !!address &&
        (isSuperTokenNative === true || isSuperTokenWrapper === true),
    },
  });

  const { data: underlyingTokenAllowance } = useReadContract({
    address: tokenUnderlyingAddress as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, selectedToken.address],
    chainId: network.id,
    query: {
      enabled: isSuperTokenWrapper === true && !!address,
      refetchInterval: 10000,
    },
  });

  const { data: userQueryRes, refetch: refetchUserAccount } = useQuery(
    USER_ACCOUNT_QUERY,
    {
      client: getApolloClient("superfluid", network.id),
      variables: {
        userAddress: address?.toLowerCase() ?? "",
        token: selectedToken.address.toLowerCase(),
      },
      skip: !address,
      pollInterval: 10000,
    },
  );

  const { data: receiverQueryRes, refetch: refetchReceiverInflow } = useQuery(
    RECEIVER_INFLOW_QUERY,
    {
      client: getApolloClient("superfluid", network.id),
      variables: {
        receiverAddress: receiverAddress.toLowerCase(),
        token: selectedToken.address.toLowerCase(),
      },
      skip: !receiverAddress,
      pollInterval: 10000,
    },
  );

  const userAccountSnapshot =
    userQueryRes?.account?.accountTokenSnapshots?.[0] ?? null;

  const superTokenBalance = useFlowingAmount(
    BigInt(userAccountSnapshot?.balanceUntilUpdatedAt ?? 0),
    userAccountSnapshot?.updatedAtTimestamp ?? 0,
    BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0),
  );

  const outflowToReceiver = useMemo(() => {
    if (!address || !receiverAddress || !userQueryRes?.account?.outflows) {
      return null;
    }

    return (
      userQueryRes.account.outflows.find(
        (o: { receiver: { id: string } }) =>
          o.receiver.id === receiverAddress.toLowerCase(),
      ) ?? null
    );
  }, [address, receiverAddress, userQueryRes]);

  const flowRateToReceiver = outflowToReceiver?.currentFlowRate ?? "0";

  useEffect(() => {
    userEditedMonthlyAmount.current = false;
  }, [selectedToken.address]);

  useEffect(() => {
    if (userEditedMonthlyAmount.current) return;

    const currentStreamValue = roundWeiAmount(
      BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
      4,
    );

    setMonthlyAmount(currentStreamValue !== "0" ? currentStreamValue : "");
  }, [flowRateToReceiver]);

  useEffect(() => {
    if (!areTransactionsLoading && monthlyAmount) {
      const rate =
        parseEther(monthlyAmount.replace(/,/g, "")) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));

      if (rate < MAX_FLOW_RATE) {
        setNewFlowRate(rate.toString());
      }
    }
  }, [areTransactionsLoading, monthlyAmount]);

  const calls = useMemo(() => {
    if (
      !address ||
      !newFlowRate ||
      !receiverAddress ||
      isSuperTokenWrapper === undefined
    )
      return [];

    const chainId = network.id as keyof typeof hostAddress;
    const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
    const wrapAmountUnits = parseUnits(
      wrapAmount?.replace(/,/g, "") ?? "0",
      underlyingTokenBalance?.decimals ?? 18,
    );
    const needsApproval =
      isSuperTokenWrapper &&
      wrapAmountUnits > BigInt(underlyingTokenAllowance ?? 0);
    const newCalls: TransactionCall[] = [];
    const batchOps = [];

    if (wrapAmount && Number(wrapAmount.replace(/,/g, "")) > 0) {
      const wrap = buildWrapCalls({
        tokenAddress: selectedToken.address,
        wrapAmountWei,
        wrapAmountUnits,
        isSuperTokenWrapper,
        isSuperTokenNative: isSuperTokenNative ?? false,
        tokenUnderlyingAddress,
        needsApproval,
      });

      newCalls.push(...wrap.calls);
      batchOps.push(...wrap.batchOps);
    }

    batchOps.push(
      ...buildFlowBatchOps({
        tokenAddress: selectedToken.address,
        senderAddress: address,
        receiverAddress: receiverAddress as Address,
        newFlowRate,
        flowRateToReceiver,
        chainId,
      }),
    );

    const batchCall = buildBatchCall(batchOps, chainId);

    if (batchCall) {
      newCalls.push(batchCall);
    }

    return newCalls;
  }, [
    address,
    wrapAmount,
    newFlowRate,
    flowRateToReceiver,
    receiverAddress,
    selectedToken.address,
    underlyingTokenAllowance,
    isSuperTokenWrapper,
    isSuperTokenNative,
    tokenUnderlyingAddress,
    underlyingTokenBalance?.decimals,
    network.id,
  ]);

  const handleExecute = useCallback(async () => {
    setIsSuccess(false);

    try {
      await executeTransactions(calls);
      setWrapAmount("");
      userEditedMonthlyAmount.current = false;
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      refetchUserAccount();
      refetchReceiverInflow();
    } catch {
      // transactionError state is set by the hook
    }
  }, [calls, executeTransactions, refetchUserAccount, refetchReceiverInflow]);

  const handleCancel = useCallback(async () => {
    if (!address || !receiverAddress) return;

    const chainId = network.id as keyof typeof cfaAddress;
    setIsSuccess(false);

    const deleteOps = buildDeleteFlowBatchOps({
      tokenAddress: selectedToken.address,
      senderAddress: address,
      receiverAddress: receiverAddress as Address,
      chainId,
    });
    const cancelCalls: TransactionCall[] = [
      buildBatchCall(deleteOps, chainId)!,
    ];

    try {
      await executeTransactions(cancelCalls);
      userEditedMonthlyAmount.current = false;
      setMonthlyAmount("");
      setNewFlowRate("");
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      refetchUserAccount();
      refetchReceiverInflow();
    } catch {
      // transactionError state is set by the hook
    }
  }, [
    address,
    receiverAddress,
    selectedToken.address,
    network.id,
    executeTransactions,
    refetchUserAccount,
    refetchReceiverInflow,
  ]);

  const handleWrapAmountChange = useCallback((value: string) => {
    const stripped = value.replace(/[^0-9.]/g, "");
    const dotIndex = stripped.indexOf(".");
    const cleaned =
      dotIndex === -1
        ? stripped
        : stripped.slice(0, dotIndex + 1) +
          stripped.slice(dotIndex + 1).replace(/\./g, "");

    setWrapAmount(cleaned);
  }, []);

  const handleMonthlyAmountChange = useCallback((value: string) => {
    userEditedMonthlyAmount.current = true;

    const stripped = value.replace(/[^0-9.]/g, "");
    const dotIndex = stripped.indexOf(".");
    const cleaned =
      dotIndex === -1
        ? stripped
        : stripped.slice(0, dotIndex + 1) +
          stripped.slice(dotIndex + 1).replace(/\./g, "");

    if (cleaned === "" || cleaned === ".") {
      setMonthlyAmount(cleaned);
      setNewFlowRate("0");
      return;
    }

    const rate =
      parseEther(cleaned) /
      BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));

    if (rate < MAX_FLOW_RATE) {
      setMonthlyAmount(cleaned);
      setNewFlowRate(rate.toString());
    }
  }, []);

  const userNetMonthlyFlow = useMemo(() => {
    const rate = BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0);

    if (rate === BigInt(0)) return null;

    return {
      value: formatNumber(
        Number(
          roundWeiAmount(
            (rate < 0 ? -rate : rate) * BigInt(SECONDS_IN_MONTH),
            4,
          ),
        ),
      ),
      isPositive: rate > BigInt(0),
    };
  }, [userAccountSnapshot?.totalNetFlowRate]);

  const wrapAmountWei = useMemo(
    () => parseEther(wrapAmount?.replace(/,/g, "") || "0"),
    [wrapAmount],
  );

  const hasPendingChanges =
    wrapAmountWei > BigInt(0) ||
    (!!newFlowRate && BigInt(newFlowRate) !== BigInt(flowRateToReceiver));

  const pendingBalance = useMemo(
    () => superTokenBalance + wrapAmountWei,
    [superTokenBalance, wrapAmountWei],
  );

  const pendingNetMonthlyFlow = useMemo(() => {
    if (!hasPendingChanges) return null;

    const totalNetFlowRate = BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0);
    const pendingRate =
      totalNetFlowRate +
      BigInt(flowRateToReceiver) -
      BigInt(newFlowRate || "0");

    if (pendingRate === BigInt(0)) return null;

    return {
      value: formatNumber(
        Number(
          roundWeiAmount(
            (pendingRate < 0 ? -pendingRate : pendingRate) *
              BigInt(SECONDS_IN_MONTH),
            4,
          ),
        ),
      ),
      isPositive: pendingRate > BigInt(0),
    };
  }, [
    hasPendingChanges,
    userAccountSnapshot?.totalNetFlowRate,
    flowRateToReceiver,
    newFlowRate,
  ]);

  const liquidationEstimate = useMemo(() => {
    if (!address || !newFlowRate || BigInt(newFlowRate) === BigInt(0)) {
      return null;
    }

    const totalNetFlowRate = BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0);
    const existingRate = BigInt(flowRateToReceiver);
    const proposedRate = BigInt(newFlowRate);
    const newNetRate = totalNetFlowRate + existingRate - proposedRate;

    if (newNetRate >= BigInt(0)) {
      return null;
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const updatedAt = BigInt(userAccountSnapshot?.updatedAtTimestamp ?? 0);
    const snapshotBalance = BigInt(
      userAccountSnapshot?.balanceUntilUpdatedAt ?? 0,
    );
    const elapsed = updatedAt > BigInt(0) ? now - updatedAt : BigInt(0);
    const currentBalance = snapshotBalance + totalNetFlowRate * elapsed;
    const effectiveBalance = currentBalance + wrapAmountWei;

    if (effectiveBalance <= BigInt(0)) {
      return { timestamp: 0, bufferExceedsBalance: true };
    }

    const secondsFromNow = effectiveBalance / -newNetRate;
    const timestamp = Number(now + secondsFromNow);

    if (timestamp <= Math.floor(Date.now() / 1000)) {
      return { timestamp: 0, bufferExceedsBalance: true };
    }

    return { timestamp, bufferExceedsBalance: false };
  }, [
    address,
    newFlowRate,
    wrapAmountWei,
    flowRateToReceiver,
    userAccountSnapshot?.totalNetFlowRate,
    userAccountSnapshot?.balanceUntilUpdatedAt,
    userAccountSnapshot?.updatedAtTimestamp,
  ]);

  const receiverSnapshot =
    receiverQueryRes?.account?.accountTokenSnapshots?.[0] ?? null;

  const receiverDataReady = receiverQueryRes?.account !== undefined;
  const userDataReady = userQueryRes?.account !== undefined;

  const totalReceiverMonthlyRate = useMemo(
    () =>
      receiverDataReady
        ? roundWeiAmount(
            BigInt(receiverSnapshot?.totalInflowRate ?? 0) *
              BigInt(SECONDS_IN_MONTH),
            4,
          )
        : null,
    [receiverDataReady, receiverSnapshot?.totalInflowRate],
  );

  const userMonthlyRate = useMemo(
    () =>
      userDataReady
        ? roundWeiAmount(
            BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
            4,
          )
        : null,
    [userDataReady, flowRateToReceiver],
  );

  const hasExistingFlow = BigInt(flowRateToReceiver) > 0;

  const wrapAmountExceedsBalance = useMemo(() => {
    if (!wrapAmount || !underlyingTokenBalance) return false;

    const cleaned = wrapAmount.replace(/,/g, "");
    if (!cleaned || Number(cleaned) === 0) return false;

    const wrapWei = parseEther(cleaned);
    return wrapWei > underlyingTokenBalance.value;
  }, [wrapAmount, underlyingTokenBalance]);

  const bufferExceedsBalance =
    !!liquidationEstimate && liquidationEstimate.bufferExceedsBalance;

  const canExecute =
    !!address &&
    !!newFlowRate &&
    BigInt(newFlowRate) > 0 &&
    !areTransactionsLoading &&
    !wrapAmountExceedsBalance &&
    !bufferExceedsBalance;

  const resetInputs = useCallback(() => {
    userEditedMonthlyAmount.current = false;
    setWrapAmount("");
    setMonthlyAmount("");
    setNewFlowRate("");
    setIsSuccess(false);
  }, []);

  return {
    address,
    openConnectModal,
    selectedToken,
    setSelectedToken,
    monthlyAmount,
    handleMonthlyAmountChange,
    wrapAmount,
    setWrapAmount,
    handleWrapAmountChange,
    isSuperTokenNative,
    isSuperTokenPure,
    isSuperTokenWrapper,
    nativeTokenSymbol,
    underlyingTokenBalance: underlyingTokenBalance
      ? {
          value: underlyingTokenBalance.value,
          decimals: underlyingTokenBalance.decimals,
          symbol: underlyingTokenBalance.symbol,
          formatted: formatNumber(
            Number(
              formatUnits(
                underlyingTokenBalance.value,
                underlyingTokenBalance.decimals,
              ),
            ),
          ),
        }
      : null,
    superTokenBalance,
    userNetMonthlyFlow,
    hasPendingChanges,
    pendingBalance,
    pendingNetMonthlyFlow,
    liquidationEstimate,
    bufferExceedsBalance,
    wrapAmountExceedsBalance,
    totalReceiverMonthlyRate,
    userMonthlyRate,
    flowRateToReceiver,
    hasExistingFlow,
    areTransactionsLoading,
    completedTransactions,
    transactionCount: calls.length,
    transactionError,
    isSuccess,
    canExecute,
    handleExecute,
    handleCancel,
    isCorrectChain,
    switchChain,
    resetInputs,
  };
}
