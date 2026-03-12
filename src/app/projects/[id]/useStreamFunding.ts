import { useState, useMemo, useEffect, useCallback } from "react";
import { Address, isAddress, parseAbi, parseEther, formatUnits } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import { useQuery, gql } from "@apollo/client";
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

const USER_ACCOUNT_QUERY = gql`
  query UserAccountQuery($userAddress: String!, $token: String!) {
    account(id: $userAddress) {
      accountTokenSnapshots {
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
  const [successMessage, setSuccessMessage] = useState("");

  const { address, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });
  const { areTransactionsLoading, transactionError, executeTransactions } =
    useTransactionsQueue();

  const isCorrectChain = walletChainId === network.id;

  const { data: underlyingTokenAddress } = useReadContract({
    address: selectedToken.address,
    abi: parseAbi(["function getUnderlyingToken() view returns (address)"]),
    functionName: "getUnderlyingToken",
    chainId: network.id,
  });

  const isSuperTokenNative =
    selectedToken.symbol === "ETHx" || selectedToken.symbol === "CELOx";
  const isSuperTokenPure =
    !isSuperTokenNative && underlyingTokenAddress === ZERO_ADDRESS;

  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network.id,
    token:
      isSuperTokenNative || !underlyingTokenAddress
        ? void 0
        : (underlyingTokenAddress as Address),
    query: { refetchInterval: 10000, enabled: !isSuperTokenPure },
  });

  const { data: userQueryRes } = useQuery(USER_ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      userAddress: address?.toLowerCase() ?? "",
      token: selectedToken.address.toLowerCase(),
    },
    skip: !address,
    pollInterval: 10000,
  });

  const { data: receiverQueryRes } = useQuery(RECEIVER_INFLOW_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      receiverAddress: receiverAddress.toLowerCase(),
      token: selectedToken.address.toLowerCase(),
    },
    skip: !receiverAddress,
    pollInterval: 10000,
  });

  const userAccountSnapshot =
    userQueryRes?.account?.accountTokenSnapshots?.find(
      (s: { token: { id: string } }) =>
        s.token.id === selectedToken.address.toLowerCase(),
    ) ?? null;

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

        setUnderlyingTokenAllowance(allowance ?? "0");
        setSfFramework(framework);
        setSuperToken(token);
      }
    })();
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
    setSuccessMessage("");

    try {
      await executeTransactions(transactions);
      setSuccessMessage(
        BigInt(flowRateToReceiver) > 0 ? "Stream updated!" : "Stream started!",
      );
    } catch {
      // transactionError state is set by the hook
    }
  }, [transactions, executeTransactions, flowRateToReceiver]);

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

    setSuccessMessage("");

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
      setMonthlyAmount("");
      setNewFlowRate("");
      setSuccessMessage("Stream cancelled.");
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
  ]);

  const handleMonthlyAmountChange = useCallback((value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");

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
  const canExecute =
    !!address &&
    !!newFlowRate &&
    BigInt(newFlowRate) > 0 &&
    !areTransactionsLoading;

  const resetInputs = useCallback(() => {
    setWrapAmount("");
    setMonthlyAmount("");
    setNewFlowRate("");
    setSuccessMessage("");
  }, []);

  return {
    selectedToken,
    setSelectedToken,
    monthlyAmount,
    handleMonthlyAmountChange,
    wrapAmount,
    setWrapAmount,
    isSuperTokenNative,
    isSuperTokenPure,
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
    totalReceiverMonthlyRate,
    userMonthlyRate,
    flowRateToReceiver,
    hasExistingFlow,
    areTransactionsLoading,
    transactionError,
    successMessage,
    canExecute,
    handleExecute,
    handleCancel,
    isCorrectChain,
    switchChain,
    resetInputs,
  };
}
