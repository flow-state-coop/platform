import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Address, isAddress, parseAbi, parseEther, formatUnits } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, gql } from "@apollo/client";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import {
  NativeAssetSuperToken,
  WrapperSuperToken,
  SuperToken,
  Operation,
  Framework,
} from "@superfluid-finance/sdk-core";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { getApolloClient } from "@/lib/apollo";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useFlowingAmount from "@/hooks/flowingAmount";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  roundWeiAmount,
  formatNumber,
} from "@/lib/utils";
import { SECONDS_IN_MONTH, MAX_FLOW_RATE, ZERO_ADDRESS } from "@/lib/constants";

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
  const [sfFramework, setSfFramework] = useState<Framework | null>(null);
  const [superToken, setSuperToken] = useState<
    NativeAssetSuperToken | WrapperSuperToken | SuperToken | null
  >(null);
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [isSuccess, setIsSuccess] = useState(false);
  const userEditedMonthlyAmount = useRef(false);

  const { address, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();

  const isCorrectChain = walletChainId === network.id;

  const isSuperTokenNative =
    selectedToken.symbol === "ETHx" || selectedToken.symbol === "CELOx";

  const { data: underlyingTokenAddress } = useReadContract({
    address: selectedToken.address,
    abi: parseAbi(["function getUnderlyingToken() view returns (address)"]),
    functionName: "getUnderlyingToken",
    chainId: network.id,
    query: { enabled: !isSuperTokenNative },
  });
  const isSuperTokenWrapper =
    !isSuperTokenNative &&
    !!underlyingTokenAddress &&
    underlyingTokenAddress !== ZERO_ADDRESS;
  const isSuperTokenPure = !isSuperTokenNative && !isSuperTokenWrapper;
  const nativeTokenSymbol = selectedToken.symbol === "CELOx" ? "CELO" : "ETH";

  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network.id,
    token:
      isSuperTokenNative || !underlyingTokenAddress
        ? void 0
        : (underlyingTokenAddress as Address),
    query: {
      refetchInterval: 10000,
      enabled: !!address && (isSuperTokenNative || isSuperTokenWrapper),
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (address && ethersProvider && isAddress(selectedToken.address)) {
        const framework = await Framework.create({
          chainId: network.id,
          resolverAddress: network.superfluidResolver,
          provider: ethersProvider,
        });
        const token = await framework.loadSuperToken(selectedToken.address);
        const underlying = token.underlyingToken;
        const allowance = await underlying?.allowance({
          owner: address,
          spender: token.address,
          providerOrSigner: ethersProvider,
        });

        if (!cancelled) {
          setUnderlyingTokenAllowance(allowance ?? "0");
          setSfFramework(framework);
          setSuperToken(token);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, ethersProvider, selectedToken.address, network]);

  const transactions = useMemo(() => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !newFlowRate ||
      !ethersProvider ||
      !ethersSigner ||
      !receiverAddress
    ) {
      return [];
    }

    const underlyingToken = superToken.underlyingToken;
    const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
    const isWrapperSuperToken =
      underlyingToken && underlyingToken.address !== ZERO_ADDRESS;
    const needsApproval =
      isWrapperSuperToken &&
      wrapAmountWei > BigInt(underlyingTokenAllowance ?? 0);
    const txs: (() => Promise<void>)[] = [];
    const operations: Operation[] = [];

    if (wrapAmount && Number(wrapAmount.replace(/,/g, "")) > 0) {
      if (underlyingToken && needsApproval) {
        txs.push(async () => {
          const tx = await underlyingToken
            .approve({
              receiver: selectedToken.address,
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);
          await tx.wait();
        });
      }

      if (isWrapperSuperToken) {
        operations.push(
          (superToken as WrapperSuperToken).upgrade({
            amount: wrapAmountWei.toString(),
          }),
        );
      } else {
        txs.push(async () => {
          const tx = await (superToken as NativeAssetSuperToken)
            .upgrade({ amount: wrapAmountWei.toString() })
            .exec(ethersSigner);
          await tx.wait();
        });
      }
    }

    if (BigInt(newFlowRate) === BigInt(0) && BigInt(flowRateToReceiver) > 0) {
      operations.push(
        superToken.deleteFlow({
          sender: address,
          receiver: receiverAddress,
        }),
      );
    } else if (BigInt(flowRateToReceiver) > 0) {
      operations.push(
        superToken.updateFlow({
          sender: address,
          receiver: receiverAddress,
          flowRate: newFlowRate,
        }),
      );
    } else {
      operations.push(
        superToken.createFlow({
          sender: address,
          receiver: receiverAddress,
          flowRate: newFlowRate,
        }),
      );
    }

    txs.push(async () => {
      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);
      await tx.wait();
    });

    return txs;
  }, [
    address,
    sfFramework,
    superToken,
    wrapAmount,
    newFlowRate,
    flowRateToReceiver,
    ethersProvider,
    ethersSigner,
    receiverAddress,
    selectedToken.address,
    underlyingTokenAllowance,
  ]);

  const handleExecute = useCallback(async () => {
    setIsSuccess(false);

    try {
      await executeTransactions(transactions);
      setWrapAmount("");
      userEditedMonthlyAmount.current = false;
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      refetchUserAccount();
      refetchReceiverInflow();
    } catch {
      // transactionError state is set by the hook
    }
  }, [
    transactions,
    executeTransactions,
    refetchUserAccount,
    refetchReceiverInflow,
  ]);

  const handleCancel = useCallback(async () => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !ethersSigner ||
      !receiverAddress
    ) {
      return;
    }

    setIsSuccess(false);

    const cancelTxs = [
      async () => {
        const tx = await sfFramework
          .batchCall([
            superToken.deleteFlow({
              sender: address,
              receiver: receiverAddress,
            }),
          ])
          .exec(ethersSigner);
        await tx.wait();
      },
    ];

    try {
      await executeTransactions(cancelTxs);
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
    sfFramework,
    superToken,
    ethersSigner,
    receiverAddress,
    executeTransactions,
    refetchUserAccount,
    refetchReceiverInflow,
  ]);

  const handleWrapAmountChange = useCallback((value: string) => {
    const stripped = value.replace(/[^0-9.,]/g, "");
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
    transactionCount: transactions.length,
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
